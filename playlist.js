const fs = require('fs')
const path = require('path')
const IPTVChecker = require('./src/index')

const updatePlaylist = async () => {
  // const currentDir = process.cwd()
  const playlistDir = path.join(__dirname, 'playlist')

  if (!fs.existsSync(playlistDir)) {
    fs.mkdirSync(playlistDir)
  }

  const checker = new IPTVChecker()

  const response = await fetch('https://raw.githubusercontent.com/devsolux/flag-icons/master/country.json')
  if (response.ok) {
    const responseJson = await response.json()

    let countries = []
    for (let raw of responseJson) {
      if (!raw.code) {
        continue
      }

      try {
        const playlistUrl = `https://iptv-org.github.io/iptv/countries/${raw.code}.m3u`
        const checkM3U = await checker.checkPlaylist(playlistUrl)
        if (checkM3U && checkM3U.item.length > 0) {
          const items = []
          for (let rawLine of checkM3U.items) {
            if (rawLine.url && rawLine.status.length > 0) {
              if (rawLine.status.ok) {
                rawLine.status = rawLine.status.code
                items.push(rawLine)
              }
            }
          }

          if (items.length > 0) {
            const playlistJSON = {
              header: checkM3U.header,
              items: items,
            }

            try {
              fs.writeFileSync(path.join(playlistDir, `${raw.code}.json`), JSON.stringify(playlistJSON, null, 2))
            } catch (err) {
              console.error(err)
              continue
            }

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
      } catch (err) {
        console.log(err.message)
      }
    }

    try {
      fs.writeFileSync(path.join(playlistDir, 'countries.json'), JSON.stringify(countries, null, 2))
    } catch (err) {
      console.error(err)
    }
  }
}

updatePlaylist()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
