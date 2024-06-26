#! /usr/bin/env node

const fs = require('fs')
const { Command } = require('commander')
const getStdin = require('get-stdin')
const ProgressBar = require('progress')
const dateFormat = require('dateformat')
const chalk = require('chalk')
const IPTVChecker = require('./src/index')
const Logger = require('./src/logger')

let seedFile
let bar
const stats = {
  total: 0,
  online: 0,
  offline: 0,
  duplicates: 0,
}

const program = new Command()

program
  .name('iptv-playlist')
  .description('Utility to check M3U playlists entries')
  .usage('[options] [file-or-url]')
  .option('-o, --output <output>', 'Path to output directory')
  .option('-t, --timeout <timeout>', 'Set the number of milliseconds for each request', '60000')
  .option('-p, --parallel <number>', 'Batch size of items to check concurrently', '1')
  .option('-a, --user-agent <user-agent>', 'Set custom HTTP User-Agent', `IPTVChecker`)
  .option('-k, --insecure', 'Allow insecure connections when using SSL')
  .option('-d, --debug', 'Toggle debug mode')
  .argument('[file-or-url]', 'File or URL to check')
  .action(file => {
    seedFile = file
  })

program.parse(process.argv)

const options = program.opts()

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = options.insecure ? '0' : '1'

const config = {
  debug: options.debug || false,
  insecure: options.insecure,
  userAgent: options.userAgent,
  timeout: parseInt(options.timeout, 10),
  parallel: parseInt(options.parallel, 10),
  setUp,
  afterEach,
}

const logger = new Logger(config)

const outputDir = options.output || `iptv-playlist-${dateFormat(new Date(), 'd-m-yyyy-hh-MM-ss')}`
const onlineFile = `${outputDir}/online.m3u`
const offlineFile = `${outputDir}/offline.m3u`
const duplicatesFile = `${outputDir}/duplicates.m3u`

try {
  fs.lstatSync(outputDir)
} catch (e) {
  fs.mkdirSync(outputDir)
}

fs.writeFileSync(onlineFile, '#EXTM3U\n')
fs.writeFileSync(offlineFile, '#EXTM3U\n')
fs.writeFileSync(duplicatesFile, '#EXTM3U\n')

async function init() {
  try {
    if (!seedFile || !seedFile.length) seedFile = await getStdin()

    const checker = new IPTVChecker(config)
    const checked = await checker.checkPlaylist(seedFile)

    stats.online = checked.items.filter(item => item.status.ok).length
    stats.offline = checked.items.filter(item => !item.status.ok && item.status.code !== 'DUPLICATE').length
    stats.duplicates = checked.items.filter(item => !item.status.ok && item.status.code === 'DUPLICATE').length

    const result = [
      `Total: ${stats.total}`,
      chalk.green(`Online: ${stats.online}`),
      chalk.red(`Offline: ${stats.offline}`),
      chalk.yellow(`Duplicates: ${stats.duplicates}`),
    ].join('\n')

    logger.info(`\n${result}`)
    process.exit(0)
  } catch (err) {
    logger.error(err.message)
    process.exit(1)
  }
}

function afterEach(item) {
  if (item.status.ok) {
    writeToFile(onlineFile, item)
  } else if (item.status.code === 'DUPLICATE') {
    writeToFile(duplicatesFile, item)
  } else {
    writeToFile(offlineFile, item, item.status.message)
  }

  if (!config.debug) {
    bar.tick()
  }
}

function setUp(playlist) {
  stats.total = playlist.items.length
  bar = new ProgressBar('[:bar] :current/:total (:percent) ', {
    total: stats.total,
  })
}

function writeToFile(path, item, message = null) {
  const lines = item.raw.split('\n')
  const extinf = lines[0]

  if (message) {
    lines[0] = `${extinf.trim()} (${message})`
  }

  fs.appendFileSync(path, `${lines.join('\n')}\n`)
}

init().catch(error => console.log(error))
