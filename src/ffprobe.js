const {exec} = require('child_process')
const errors = require('./errors')

async function ffprobe(item, config, logger) {
    const command = buildCommand(item, config)
    logger.debug(`FFMPEG: "${command}"`)
    const timeout = item.timeout || config.timeout

    try {
        const execTimeout = typeof timeout === 'number' && isFinite(timeout) ? Math.max(0, timeout * 1000) : undefined
        const {stdout, stderr} = await execCommand(command, execTimeout !== undefined ? {timeout: execTimeout} : undefined)
        if (stdout && isJSON(stdout) && stderr) {
            const metadata = JSON.parse(stdout)
            if (!metadata.streams || !Array.isArray(metadata.streams) || metadata.streams.length === 0) {
                return {
                    ok: false,
                    code: 'FFMPEG_STREAMS_NOT_FOUND',
                    message: errors['FFMPEG_STREAMS_NOT_FOUND'],
                }
            }
            const results = parseStderr(stderr)
            metadata.requests = results.requests

            return {ok: true, code: 'OK', metadata}
        }

        logger.debug('FFMPEG_UNDEFINED')
        logger.debug(stdout)
        logger.debug(stderr)

        return {
            ok: false,
            code: 'FFMPEG_UNDEFINED',
            message: errors['FFMPEG_UNDEFINED'],
        }
    } catch (err) {
        const code = parseError(err.message, item, config, logger)

        return {
            ok: false,
            code,
            message: errors[code],
        }
    }
}

function execCommand(command, options) {
    return new Promise((resolve, reject) => {
        exec(command, options || {}, (error, stdout, stderr) => {
            if (error) {
                reject(error)
            } else {
                resolve({stdout, stderr})
            }
        })
    })
}

function parseStderr(stderr) {
    const requests = stderr
        .split(/(?:\r?\n){2,}/)
        .map(parseRequest)
        .filter(l => l)

    return {requests}
}

function buildCommand(item, config) {
    const userAgent = item.http?.['user-agent'] || config.userAgent
    const referer = item.http?.referrer || config.httpReferer
    const timeout = item.timeout || config.timeout
    let args = [`ffprobe`, `-of json`, `-v verbose`, `-hide_banner`, `-show_streams`, `-show_format`]

    if (timeout) {
        args.push(`-timeout`, `${timeout * 1000}`)
    }

    if (referer) {
        args.push(`-headers`, `"Referer: ${referer}"`)
    }

    if (userAgent) {
        args.push(`-user_agent`, `"${userAgent}"`)
    }

    args.push(`"${item.url}"`)

    return args.join(' ')
}

function parseRequest(string) {
    const urlMatch = string.match(/Opening '(.*?)' for reading/)
    const url = urlMatch ? urlMatch[1] : null
    if (!url) {
        return null
    }
    const requestMatch = string.match(/request: (.|[\r\n])+/gm)
    const request = requestMatch ? requestMatch[0] : null
    if (!request) {
        return null
    }
    const arr = request
        .split('\n')
        .map(l => l.trim())
        .filter(l => l)
    const methodMatch = arr[0].match(/request: (GET|POST)/)
    const method = methodMatch ? methodMatch[1] : null
    arr.shift()
    const headers = {}
    arr.forEach(line => {
        const parts = line.split(': ')
        if (parts && parts[1]) {
            headers[parts[0]] = parts[1]
        }
    })

    return {method, url, headers}
}

function parseError(output, item, config, logger) {
    const url = item.url
    const lines = output.split('\n')
    let line = lines.find(l => l.startsWith(url))
    if (!line) {
        line = lines.find(l => l.includes(url)) || null
    }
    const err = line ? line.replace(`${url}: `, '') : null

    switch (err) {
        case 'Protocol not found':
            return 'FFMPEG_PROTOCOL_NOT_FOUND'
        case 'Input/output error':
            return 'FFMPEG_INPUT_OUTPUT_ERROR'
        case 'Invalid data found when processing input':
            return 'FFMPEG_INVALID_DATA'
        case 'Server returned 400 Bad Request':
            return 'HTTP_BAD_REQUEST'
        case 'Server returned 401 Unauthorized (authorization failed)':
            return 'HTTP_UNAUTHORIZED'
        case 'Server returned 403 Forbidden (access denied)':
            return 'HTTP_FORBIDDEN'
        case 'Server returned 404 Not Found':
            return 'HTTP_NOT_FOUND'
        case 'Connection refused':
            return 'HTTP_CONNECTION_REFUSED'
        case "Can't assign requested address":
            return 'HTTP_CANNOT_ASSIGN_REQUESTED_ADDRESS'
        case 'Server returned 4XX Client Error, but not one of 40{0,1,3,4}':
            return 'HTTP_4XX_CLIENT_ERROR'
        default:
            logger.debug('FFMPEG_UNDEFINED')
            logger.debug(err)
            return 'FFMPEG_UNDEFINED'
    }
}

function isJSON(str) {
    try {
        JSON.parse(str)
        return true
    } catch (e) {
        return false
    }
}

module.exports = ffprobe