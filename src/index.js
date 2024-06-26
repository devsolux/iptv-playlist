require('colors')
const { isUri } = require('valid-url')
const commandExists = require('command-exists')
const eachLimit = require('async/eachLimit')
const { parsePlaylist } = require('./parser')
const cache = require('./cache')
const Logger = require('./logger')
const { cpus } = require('os')
const { loadStream } = require('./http')
const ffprobe = require('./ffprobe')

const defaultConfig = {
  debug: false,
  userAgent: null,
  timeout: 60000,
  parallel: cpus().length,
  setUp: async playlist => {}, // eslint-disable-line
  afterEach: async item => {}, // eslint-disable-line
  beforeEach: async item => {}, // eslint-disable-line
}

class IPTVChecker {
  constructor(opts = {}) {
    this.config = { ...defaultConfig, ...opts }
    this.logger = new Logger(this.config)
  }

  async checkPlaylist(input) {
    try {
      await commandExists('ffprobe')
    } catch {
      throw new Error('Executable ffprobe not found.')
    }

    if (!(input instanceof Object) && !Buffer.isBuffer(input) && typeof input !== 'string') {
      throw new Error('Unsupported input type')
    }

    const results = []
    const duplicates = []
    const { config, logger } = this

    logger.debug({ config })

    let playlist
    try {
      playlist = await parsePlaylist(input)
    } catch (err) {
      throw new Error(err)
    }

    await config.setUp(playlist)

    const items = playlist.items
      .map(item => {
        if (!isUri(item.url)) {
          return null
        }

        if (cache.check(item)) {
          duplicates.push(item)
          return null
        } else {
          cache.add(item)
          return item
        }
      })
      .filter(Boolean)

    for (const item of duplicates) {
      item.status = { ok: false, code: 'DUPLICATE', message: 'Duplicate' }
      await config.afterEach(item)
      results.push(item)
    }

    if (+config.parallel === 1) {
      for (const item of items) {
        const checkedItem = await this.checkStream(item)
        results.push(checkedItem)
      }
    } else {
      await eachLimit(items, +config.parallel, async item => {
        const result = await this.checkStream(item)
        results.push(result)
      })
    }

    return {
      header: playlist.header,
      items: results,
    }
  }

  async checkStream(item) {
    const { config, logger } = this

    await config.beforeEach(item)

    try {
      await loadStream(item, config, logger)
      item.status = await ffprobe(item, config, logger)
    } catch (status) {
      item.status = status
    }

    if (item.status.ok) {
      logger.debug(`OK: ${item.url}`.green)
    } else {
      logger.debug(`FAILED: ${item.url} (${item.status.message})`.red)
    }

    await config.afterEach(item)

    return item
  }
}

module.exports = IPTVChecker
