const fs = require('fs');
const path = require('path');
const axios = require('axios');
const IPTVChecker = require('./src/index');

const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
    throw new Error('GITHUB_TOKEN is required');
}

const playlistDir = path.join(__dirname, 'playlist');

if (!fs.existsSync(playlistDir)) {
    fs.mkdirSync(playlistDir, {recursive: true});
}

async function getSecretHash(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });

        if (response.status === 200) {
            const data = response.data;
            return data.sha || false;
        }
    } catch (error) {
        console.error(`Failed to get secret hash: ${error.message}`);
    }
    return false;
}

// https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents
async function uploadUpdateFile(fileName, jsonData) {
    const url = `https://api.github.com/repos/devsolux/iptv-playlist/contents/playlist/${fileName}.json`;
    const secretHash = await getSecretHash(url);

    const payload = {
        message: 'Update file',
        committer: {name: 'devsolux', email: 'devsolux@gmail.com'},
        content: Buffer.from(jsonData, 'utf8').toString('base64'),
    };

    if (secretHash) {
        payload.sha = secretHash;
    }

    try {
        const response = await axios.put(url, payload, {
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });

        if (response.status === 200 || response.status === 201) {
            return response.data;
        } else {
            console.log(`Failed to upload file: ${response.statusText}`);
            return 'Github Upload failed!';
        }
    } catch (error) {
        console.error(`Failed to upload file: ${error.message}`);
        return 'Github Upload failed!';
    }
}

async function getCountries() {
    const countries = [];
    try {
        const response = await axios.get('https://raw.githubusercontent.com/devsolux/flag-icons/master/country.json');
        if (response.status === 200) {
            const responseJson = response.data;

            for (const raw of responseJson) {
                if (raw && raw.code && raw.code.length > 0) {
                    const playlistUrl = `https://iptv-org.github.io/iptv/countries/${raw.code}.m3u`;
                    try {
                        const resPlaylist = await axios.get(playlistUrl);
                        if (resPlaylist.status === 200) {
                            countries.push({
                                capital: raw.capital,
                                code: raw.code,
                                continent: raw.continent,
                                flag: `assets/flags/${raw.code}.svg`,
                                name: raw.name,
                                url: playlistUrl,
                            });
                            console.warn(`Success to fetch playlist for ${raw.code}`);
                        } else {
                            console.error(`Failed to fetch playlist for ${raw.code}`);
                        }
                    } catch (error) {
                        console.error(`Failed to fetch playlist for ${raw.code}: ${error.message}`);
                    }
                }
            }

            const jsonData = JSON.stringify(countries, null, 2);

            try {
                await fs.promises.writeFile(path.join(playlistDir, 'countries.json'), jsonData);
                await uploadUpdateFile('countries', jsonData);
            } catch (err) {
                console.error(`Failed to write countries.json: ${err.message}`);
            }
        }
    } catch (error) {
        console.error(`Failed to fetch countries: ${error.message}`);
    }
    return countries;
}

const updatePlaylist = async () => {
    const countries = await getCountries();
    if (countries.length > 0) {
        const checker = new IPTVChecker();

        for (const raw of countries) {
            let items = [];
            let header = {attrs: {}, raw: '#EXTM3U'};
            try {
                const playlistData = await checker.checkPlaylist(raw.url);
                if (playlistData && playlistData.items && playlistData.items.length > 0) {
                    header = playlistData.header || header;
                    for (const rawLine of playlistData.items) {
                        if (rawLine && rawLine.url && rawLine.status && rawLine.status.ok) {
                            rawLine.status = rawLine.status.code;
                            items.push(rawLine);
                        }
                    }
                }
            } catch (err) {
                console.error(`Failed to check playlist for ${raw.code}: ${err.message}`);
            }

            const jsonData = JSON.stringify({header, items}, null, 2);

            try {
                await fs.promises.writeFile(path.join(playlistDir, `${raw.code}.json`), jsonData);
                await uploadUpdateFile(raw.code, jsonData);
            } catch (err) {
                console.error(`Failed to write ${raw.code}.json: ${err.message}`);
            }
        }
    }
};

updatePlaylist()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(`Update failed: ${error.message}`);
        process.exit(1);
    });