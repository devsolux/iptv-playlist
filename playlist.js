require('dotenv').config()
const fs = require('fs')
const path = require('path')
const IPTVChecker = require('./src/index')

const TOKEN = process.env.GITHUB_TOKEN

if (process.env.GITHUB_TOKEN === undefined) {
  throw new Error('GITHUB_TOKEN is required')
}

const playlistDir = path.join(__dirname, 'playlist')

if (!fs.existsSync(playlistDir)) {
  fs.mkdirSync(playlistDir)
}

async function getSecretHash(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  })

  if (response.ok) {
    const data = await response.json()
    if (data && data['sha']) {
      return data['sha']
    }
  }
  return false
}

// https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents
async function uploadUpdateFile(fileName, jsonData) {
  const url = `https://api.github.com/repos/devsolux/iptv-playlist/contents/playlist/${fileName}.json`
  const secret_hash = await getSecretHash(url)
  const data = JSON.stringify({
    message: 'Update file',
    committer: { name: 'devsolux', email: 'devsolux@gmail.com' },
    content: Buffer.from(jsonData).toString('base64'),
    sha: secret_hash,
  })

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: data,
  })
  if (response.ok) {
    return response.json()
  } else {
    console.log(response)
    return 'Github Upload failed!'
  }
}

const getCountries = async () => {
  let countries = []
  const response = await fetch('https://raw.githubusercontent.com/devsolux/flag-icons/master/country.json')
  if (response.ok) {
    const responseJson = await response.json()

    for (let raw of responseJson) {
      if (raw && raw.code && raw.code.length > 0) {
        const playlistUrl = `https://iptv-org.github.io/iptv/countries/${raw.code}.m3u`
        const resPlaylist = await fetch(playlistUrl)
        if (resPlaylist.ok) {
          countries.push({
            capital: raw.capital,
            code: raw.code,
            continent: raw.continent,
            flag: `assets/flags/${raw.code}.svg`,
            name: raw.name,
            url: playlistUrl,
          })
        }
      }
    }

    const jsonData = JSON.stringify(countries, null, 2)

    fs.writeFile(path.join(playlistDir, 'countries.json'), jsonData, async e => {
      console.log(e)
      await uploadUpdateFile('countries', jsonData)
    })
  }
  return countries
}

const updatePlaylist = async () => {
  const countries = await getCountries()
  if (countries.length > 0) {
    const checker = new IPTVChecker()

    for (let raw of countries) {
      let items = []
      let header = { attrs: {}, raw: '#EXTM3U' }
      try {
        const playlistData = await checker.checkPlaylist(raw.url)
        if (playlistData && playlistData.items && playlistData.items.length > 0) {
          header = playlistData.header
          for (let rawLine of playlistData.items) {
            if (rawLine.url && rawLine.status && rawLine.status.ok) {
              rawLine.status = rawLine.status.code
              items.push(rawLine)
            }
          }
        }
      } catch (err) {
        console.log(err.message)
      }

      const jsonData = JSON.stringify({ header: header, items: items }, null, 2)

      fs.writeFile(path.join(playlistDir, `${raw.code}.json`), jsonData, async e => {
        console.log(e)
        await uploadUpdateFile(raw.code, jsonData)
      })
    }
  }
}

updatePlaylist()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
