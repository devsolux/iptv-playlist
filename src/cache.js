let cache = new Set()

function add({ url }) {
  const id = hashUrl(url)
  cache.add(id)
}

function check({ url }) {
  const id = hashUrl(url)
  return cache.has(id)
}

function hashUrl(u) {
  return Buffer.from(u).toString(`hex`)
}

module.exports = {
  add,
  check,
}
