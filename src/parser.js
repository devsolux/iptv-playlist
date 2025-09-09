const {parse} = require('./playlist-parser')
const {existsSync, readFileSync} = require('fs')
const {isWebUri} = require('valid-url')
const {loadPlaylist} = require('./http')

/**
 * Parses a playlist from a given input.
 *
 * @param {Buffer|string|object} input - The input which can be a Buffer, string (URL or file path), or an object with items property.
 * @returns {Promise<object>} - A promise that resolves to the parsed playlist object.
 * @throws {Error} - Throws an error if unable to parse the playlist.
 */
async function parsePlaylist(input) {
    if (input instanceof Object && Reflect.has(input, 'items')) {
        return input
    }

    let data = input

    if (Buffer.isBuffer(input)) {
        data = input.toString('utf8')
    } else if (typeof input === 'string') {
        if (isWebUri(input)) {
            try {
                data = await loadPlaylist(input)
            } catch (error) {
                throw new Error(`Failed to load playlist from URL: ${getErrorMessage(error)}`)
            }
        } else if (existsSync(input)) {
            try {
                data = readFileSync(input, {encoding: 'utf8'})
            } catch (error) {
                throw new Error(`Failed to read file: ${getErrorMessage(error)}`)
            }
        }
    }

    if (Buffer.isBuffer(data)) {
        data = data.toString('utf8')
    }

    if (typeof data !== 'string' || !data.startsWith('#EXTM3U')) {
        throw new Error('Unable to parse a playlist')
    }

    try {
        return parse(data)
    } catch (error) {
        throw new Error(`Failed to parse playlist: ${getErrorMessage(error)}`)
    }
}

function getErrorMessage(error) {
    if (error && typeof error.message === 'string') return error.message
    try {
        return String(error)
    } catch (_) {
        return 'Unknown error'
    }
}

module.exports.parsePlaylist = parsePlaylist