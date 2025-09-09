require('colors')
const {isUri} = require('valid-url')
const commandExists = require('command-exists')
const eachLimit = require('async/eachLimit')
const {parsePlaylist} = require('./parser')
const cache = require('./cache')
const Logger = require('./logger')
const {cpus} = require('os')
const {loadStream} = require('./http')
const ffprobe = require('./ffprobe')

// Toggle ffprobe usage
const CHECK_FFPROBE = false

const defaultConfig = {
    debug: false,
    userAgent: null,
    timeout: 60000,
    parallel: cpus().length,
    setUp: async playlist => {
    },
    afterEach: async item => {
    },
    beforeEach: async item => {
    },
}

class IPTVChecker {
    constructor(opts = {}) {
        this.config = {...defaultConfig, ...opts}
        const parsedParallel = Math.floor(+this.config.parallel)
        this.config.parallel = Number.isFinite(parsedParallel) && parsedParallel > 0 ? parsedParallel : 1
        this.logger = new Logger(this.config)
    }

    async checkPlaylist(input) {
        if (CHECK_FFPROBE) {
            try {
                await commandExists('ffprobe')
            } catch {
                throw new Error('Executable ffprobe not found.')
            }
        }

        if (!(input instanceof Object) && !Buffer.isBuffer(input) && typeof input !== 'string') {
            throw new Error('Unsupported input type')
        }

        const results = []
        const duplicates = []
        const {config, logger} = this

        logger.debug({config})

        let playlist
        try {
            playlist = await parsePlaylist(input)
        } catch (err) {
            if (err instanceof Error) {
                throw err
            }
            throw new Error(String(err))
        }

        await config.setUp(playlist)

        const items = (playlist.items || [])
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
            item.status = {ok: false, code: 'DUPLICATE', message: 'Duplicate'}
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
        const {config, logger} = this

        await config.beforeEach(item)

        try {
            await loadStream(item, config, logger)

            if (CHECK_FFPROBE) {
                item.status = await ffprobe(item, config, logger)
            } else {
                // If we don't use ffprobe, consider successful load as OK
                item.status = {ok: true, code: 'OK', message: 'Stream loaded'}
            }
        } catch (status) {
            item.status = status
        }

        if (item.status && item.status.ok) {
            logger.debug(`OK: ${item.url}`.green)
        } else {
            const message = item.status && item.status.message ? item.status.message : 'Unknown error'
            logger.debug(`FAILED: ${item.url} (${message})`.red)
        }

        await config.afterEach(item)

        return item
    }
}

module.exports = IPTVChecker