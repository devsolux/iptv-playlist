class CurlHelper {
  constructor(config) {
    this.request = config
  }

  getHeaders() {
    let { headers, method } = this.request
    let curlHeaders = ''

    // Get the headers concerning the appropriate method (defined in the global axios instance)
    if (headers.hasOwnProperty('common')) {
      headers = this.request.headers[method]
    }

    // Add any custom headers (defined upon calling methods like .get(), .post(), etc.)
    for (const property in this.request.headers) {
      if (!['common', 'delete', 'get', 'head', 'patch', 'post', 'put'].includes(property)) {
        headers[property] = this.request.headers[property]
      }
    }

    for (const property in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, property)) {
        const header = `${property}: ${headers[property]}`
        curlHeaders += ` -H '${header}'`
      }
    }

    return curlHeaders.trim()
  }

  getMethod() {
    return `-X ${this.request.method.toUpperCase()}`
  }

  getBody() {
    const { data, method } = this.request
    if (data !== undefined && data !== '' && data !== null && method.toUpperCase() !== 'GET') {
      const formattedData = typeof data === 'object' || Array.isArray(data) ? JSON.stringify(data) : data
      return `--data '${formattedData}'`.trim()
    }
    return ''
  }

  getUrl() {
    const { baseURL, url } = this.request
    if (baseURL) {
      return `${baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`
        .replace(/\/{2,}/g, '/')
        .replace('http:/', 'http://')
        .replace('https:/', 'https://')
    }
    return url
  }

  getQueryString() {
    const { params, paramsSerializer } = this.request
    if (paramsSerializer) {
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
    let url = this.getUrl()
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
  const { command } = curlResult
  if (err) {
    console.error(err)
  } else {
    console.info(command)
  }
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
