const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

function parseLine (line, index) {
  return {
    index,
    raw: line
  };
}

function parseHeader (line) {
  const supportedAttrs = ['x-tvg-url', 'url-tvg'];

  let attrs = {};
  for (let attrName of supportedAttrs) {
    const tvgUrl = getAttribute(line, attrName);
    if (tvgUrl) {
      attrs[attrName] = tvgUrl;
    }
  }

  return {
    attrs,
    raw: line.raw
  };
}

const getName = (line) => {
  const info = line.replace(/\="(.*?)"/g, '');
  const parts = info.split(/,(.*)/);
  return parts[1] || '';
};

const getAttribute = (line, name) => {
  const regex = new RegExp(name + '="(.*?)"', 'gi');
  const match = regex.exec(line);
  return match && match[1] ? match[1] : '';
};

const getOption = (line, name) => {
  const regex = new RegExp(':' + name + '=(.*)', 'gi');
  const match = regex.exec(line);
  return match && match[1] && typeof match[1] === 'string' ? match[1].replace(/\"/g, '') : '';
};

const getValue = (line) => {
  const regex = new RegExp(':(.*)', 'gi');
  const match = regex.exec(line);
  return match && match[1] && typeof match[1] === 'string' ? match[1].replace(/\"/g, '') : '';
};

const getURL = function (line) {
  return line.split('|')[0] || '';
};

const getParameter = (line, name) => {
  const params = line.replace(/^(.*)\|/, '');
  const regex = new RegExp(name + '=(\\w[^&]*)', 'gi');
  const match = regex.exec(params);
  return match && match[1] ? match[1] : '';
};

const parsePlaylist = async (content) => {
  let playlist = {
    header: {
      attrs: {
        'x-tvg-url': '',
        'url-tvg': ''
      },
      raw: ''
    },
    items: []
  };

  const lines = content.split('\n').map(parseLine);
  const firstLine = lines.find(l => l.index === 0);

  if (!firstLine || !/^#EXTM3U/.test(firstLine.raw)) {
    throw new Error('Playlist is not valid');
  }

  playlist.header = parseHeader(firstLine);

  let i = 0;
  const items = [];
  for (let rawLine of lines) {
    if (rawLine.index === 0) {
      continue;
    }
    const line = rawLine.raw.toString().trim();
    if (line.startsWith('#EXTINF:')) {
      items[i] = {
        name: getName(line),
        tvg: {
          id: getAttribute(line, 'tvg-id'),
          name: getAttribute(line, 'tvg-name'),
          logo: getAttribute(line, 'tvg-logo'),
          url: getAttribute(line, 'tvg-url'),
          rec: getAttribute(line, 'tvg-rec')
        },
        group: {
          title: getAttribute(line, 'group-title')
        },
        http: {
          referrer: '',
          'user-agent': getAttribute(line, 'user-agent')
        },
        url: '',
        raw: rawLine.raw,
        line: rawLine.index + 1,
        catchup: {
          type: getAttribute(line, 'catchup'),
          days: getAttribute(line, 'catchup-days'),
          source: getAttribute(line, 'catchup-source')
        },
        timeshift: getAttribute(line, 'timeshift'),
        radio: getAttribute(line, 'radio')
      };
    } else if (line.startsWith('#EXTVLCOPT:')) {
      if (!items[i]) {
        continue;
      }
      items[i].http.referrer = getOption(line, 'http-referrer') || items[i].http.referrer;
      items[i].http['user-agent'] = getOption(line, 'http-user-agent') || items[i].http['user-agent'];
      items[i].raw += `\r\n${rawLine.raw}`;
    } else if (line.startsWith('#EXTGRP:')) {
      if (!items[i]) {
        continue;
      }
      items[i].group.title = getValue(line) || items[i].group.title;
      items[i].raw += `\r\n${rawLine.raw}`;
    } else {
      if (!items[i]) {
        continue;
      }
      const url = getURL(line);
      const user_agent = getParameter(line, 'user-agent');
      const referrer = getParameter(line, 'referer');
      if (url) {
        items[i].url = url;
        items[i].http['user-agent'] = user_agent || items[i].http['user-agent'];
        items[i].http.referrer = referrer || items[i].http.referrer;
        items[i].raw += `\r\n${rawLine.raw}`;
        i++;
      } else {
        if (!items[i]) {
          continue;
        }
        items[i].raw += `\r\n${rawLine.raw}`;
      }
    }
  }

  playlist.items = Object.values(items);

  return playlist;
};

const updatePlaylist = async () => {
  const currentDir = process.cwd();
  const playlistDir = path.join(currentDir, 'playlist');

  try {
    const stats = fs.statSync(playlistDir);
    if (!stats.isDirectory()) {
      console.log('Path is not a directory');
      return;
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('Directory does not exist');
    } else {
      console.error(err);
    }
    return;
  }

  const response = await fetch('https://raw.githubusercontent.com/devsolux/flag-icons/master/country.json');
  if (response.ok) {
    const responseJson = await response.json();

    let countries = [];
    for (let raw of responseJson) {
      if (!raw.code) {
        continue;
      }

      const playlistUrl = 'https://iptv-org.github.io/iptv/countries/' + raw.code + '.m3u';
      const resPlaylist = await fetch(playlistUrl);
      if (resPlaylist.ok) {
        const resData = await resPlaylist.text();
        const results = await parsePlaylist(resData);
        if (results && results.items.length > 0) {
          try {
            fs.writeFileSync(path.join(playlistDir, raw.code + '.json'), JSON.stringify(results));
          } catch (err) {
            console.error(err);
            continue;
          }

          countries.push({
            capital: raw.capital,
            code: raw.code,
            continent: raw.continent,
            flag: 'assets/flags/' + raw.code + '.svg',
            name: raw.name,
            url: playlistUrl
          });
        }
      }
    }

    try {
      fs.writeFileSync(path.join(playlistDir, 'countries.json'), JSON.stringify(countries));
    } catch (err) {
      console.error(err);
    }
  }
};

updatePlaylist();
