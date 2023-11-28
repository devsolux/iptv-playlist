class Logger {
  constructor({ debug }) {
    this.debugMode = debug
  }

  info(msg) {
    this.print(msg)
  }

  error(err) {
    this.print(err)
  }

  debug(msg) {
    if (!this.debugMode) {
      return
    }
    this.print(msg)
  }

  print(msg) {
    if (typeof msg === `object`) {
      console.log(JSON.stringify(msg, null, 1))
    } else {
      console.log(msg)
    }
  }
}

module.exports = Logger
