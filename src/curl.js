const RESERVED_HEADER_KEYS = new Set(['common', 'delete', 'get', 'head', 'patch', 'post', 'put'])

function hasOwn(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop)
}

function singleQuote(val) {
    const s = String(val)
    return `'${s.replace(/'/g, "'\\''")}'`
}

class CurlHelper {
    constructor(config) {
        this.request = config || {}
    }

    getHeaders() {
        let {headers, method} = this.request || {}
        let curlHeaders = ''

        const reqHeaders = (this.request && this.request.headers) || {}

        // Get the headers concerning the appropriate method (defined in the global axios instance)
        if (headers && hasOwn(headers, 'common')) {
            const methodKey = (method || '').toLowerCase()
            headers = (headers && headers[methodKey]) || {}
        }

        // Add any custom headers (defined upon calling methods like .get(), .post(), etc.)
        for (const property in reqHeaders) {
            if (!RESERVED_HEADER_KEYS.has(property)) {
                if (!headers || typeof headers !== 'object') headers = {}
                headers[property] = reqHeaders[property]
            }
        }

        if (headers && typeof headers === 'object') {
            for (const property in headers) {
                if (hasOwn(headers, property)) {
                    const header = `${property}: ${headers[property]}`
                    curlHeaders += ` -H ${singleQuote(header)}`
                }
            }
        }

        return curlHeaders.trim()
    }

    getMethod() {
        const method = (this.request && this.request.method) ? this.request.method : 'GET'
        return `-X ${String(method).toUpperCase()}`
    }

    getBody() {
        const {data} = this.request || {}
        const method = ((this.request && this.request.method) ? this.request.method : 'GET').toUpperCase()
        if (data !== undefined && data !== '' && data !== null && method !== 'GET') {
            const formattedData = (typeof data === 'object' || Array.isArray(data)) ? JSON.stringify(data) : data
            return `--data ${singleQuote(formattedData)}`.trim()
        }
        return ''
    }

    getUrl() {
        const {baseURL, url} = this.request || {}
        if (baseURL) {
            const base = typeof baseURL === 'string' ? baseURL : ''
            const path = typeof url === 'string' ? url : ''
            return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
                .replace(/\/{2,}/g, '/')
                .replace('http:/', 'http://')
                .replace('https:/', 'https://')
        }
        return typeof url === 'string' ? url : ''
    }

    getQueryString() {
        const {params, paramsSerializer} = this.request || {}
        if (typeof paramsSerializer === 'function') {
            const serializedParams = paramsSerializer(params)
            if (!serializedParams || serializedParams.length === 0) return ''
            return serializedParams.startsWith('?') ? serializedParams : `?${serializedParams}`
        }

        const queryString = Object.keys(params || {})
            .map((key, index) => `${index !== 0 ? '&' : '?'}${key}=${params[key]}`)
            .join('')

        return queryString
    }

    getBuiltURL() {
        let url = String(this.getUrl() || '')
        const queryString = this.getQueryString()
        if (queryString) {
            url += queryString
        }
        return url.trim()
    }

    generateCommand() {
        return `curl ${this.getMethod()} "${this.getBuiltURL()}" ${this.getHeaders()} ${this.getBody()}`
            .trim()
            .replace(/\s{2,}/g, ' ')
    }
}

function defaultLogCallback(curlResult, err) {
    if (err) {
        console.error(err)
        return
    }
    const command = curlResult && curlResult.command
    console.info(command)
}

module.exports = (instance, callback = defaultLogCallback) => {
    instance.interceptors.request.use(req => {
        try {
            const curl = new CurlHelper(req)
            req.curlObject = curl
            req.curlCommand = curl.generateCommand()
            req.clearCurl = () => {
                delete req.curlObject
                delete req.curlCommand
                delete req.clearCurl
            }
        } catch (err) {
            // Even if the axios middleware is stopped, no error should occur outside.
            callback(null, err)
        } finally {
            if (req.curlirize !== false) {
                callback({
                    command: req.curlCommand,
                    object: req.curlObject,
                })
            }
            return req
        }
    })
}