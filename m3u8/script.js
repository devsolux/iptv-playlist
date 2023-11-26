document.getElementById('m-loading') && document.getElementById('m-loading').remove();
new Vue({
  el: '#m-app',

  data () {
    return {
      url: '',
      tips: 'm3u8',
      title: '',
      isPause: false,
      isGetMP4: false,
      durationSecond: 0,
      isShowRefer: false,
      downloading: false,
      beginTime: '',
      errorNum: 0,
      finishNum: 0,
      downloadIndex: 0,
      finishList: [],
      tsUrlList: [],
      mediaFileList: [],
      isSupperStreamWrite: window.streamSaver && !window.streamSaver.useBlobFallback,
      streamWriter: null,
      streamDownloadIndex: 0,
      rangeDownload: {
        isShowRange: false,
        startSegment: '',
        endSegment: '',
        targetSegment: 1,
      },
      aesConf: {
        method: '',
        uri: '',
        iv: '',
        key: '',
        decryptor: null,

        stringToBuffer: function (str) {
          return new TextEncoder().encode(str);
        },
      },
    };
  },

  created () {
    this.getSource();
    window.addEventListener('keyup', this.onKeyup);
    setInterval(this.retryAll.bind(this), 2000);
  },

  beforeDestroy () {
    window.removeEventListener('keyup', this.onKeyup);
  },

  methods: {
    getSource () {
      let { href } = location;
      if (href.indexOf('?source=') > -1) {
        this.url = href.split('?source=')[1];
      }
    },

    getDocumentTitle () {
      let title = document.title;
      try {
        title = window.top.document.title;
      } catch (error) {
        console.log(error);
      }
      return title;
    },

    onKeyup (event) {
      if (event.keyCode === 13) {
        this.getM3U8();
      }
    },

    ajax (options) {
      options = options || {};
      let xhr = new XMLHttpRequest();
      if (options.type === 'file') {
        xhr.responseType = 'arraybuffer';
      }

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          let status = xhr.status;
          if (status >= 200 && status < 300) {
            options.success && options.success(xhr.response);
          } else {
            options.fail && options.fail(status);
          }
        }
      };

      xhr.open('GET', options.url, true);
      xhr.send(null);
    },

    applyURL (targetURL, baseURL) {
      baseURL = baseURL || location.href;
      if (targetURL.indexOf('http') === 0) {
        if (location.href.indexOf('https') === 0) {
          return targetURL.replace('http://', 'https://');
        }
        return targetURL;
      } else if (targetURL[0] === '/') {
        let domain = baseURL.split('/');
        return domain[0] + '//' + domain[2] + targetURL;
      } else {
        let domain = baseURL.split('/');
        domain.pop();
        return domain.join('/') + '/' + targetURL;
      }
    },

    streamDownload (isMp4) {
      this.isGetMP4 = isMp4;
      this.title = new URL(this.url).searchParams.get('title') || this.title;
      let fileName = this.title || this.formatTime(new Date(), 'YYYY_MM_DD hh_mm_ss');
      if (document.title !== 'm3u8 downloader') {
        fileName = this.getDocumentTitle();
      }
      this.streamWriter = window.streamSaver.createWriteStream(`${fileName}.${isMp4 ? 'mp4' : 'ts'}`).getWriter();
      this.getM3U8();
    },

    getMP4 () {
      this.isGetMP4 = true;
      this.getM3U8();
    },

    getM3U8 (onlyGetRange) {
      if (!this.url) {
        alert('Please enter a URL');
        return;
      }
      if (this.url.toLowerCase().indexOf('m3u8') === -1) {
        alert('Invalid URL, please try again');
        return;
      }
      if (this.downloading) {
        alert('Resource downloading, please wait');
        return;
      }

      this.title = new URL(this.url).searchParams.get('title') || this.title;
      this.tips = 'm3u8';
      this.beginTime = new Date();
      this.ajax({
        url: this.url,
        success: (m3u8Str) => {
          this.tsUrlList = [];
          this.finishList = [];

          m3u8Str.split('\n').forEach((item) => {
            // if (/.(png|image|ts|jpg|mp4|jpeg)/.test(item)) {
            if (/^[^#]/.test(item)) {
              console.log(item);
              this.tsUrlList.push(this.applyURL(item, this.url));
              this.finishList.push({
                title: item,
                status: ''
              });
            }
          });

          if (onlyGetRange) {
            this.rangeDownload.isShowRange = true;
            this.rangeDownload.endSegment = this.tsUrlList.length;
            this.rangeDownload.targetSegment = this.tsUrlList.length;
            return;
          } else {
            let startSegment = Math.max(this.rangeDownload.startSegment || 1, 1); // 最小为 1
            let endSegment = Math.max(this.rangeDownload.endSegment || this.tsUrlList.length, 1);
            startSegment = Math.min(startSegment, this.tsUrlList.length); // 最大为 this.tsUrlList.length
            endSegment = Math.min(endSegment, this.tsUrlList.length);
            this.rangeDownload.startSegment = Math.min(startSegment, endSegment);
            this.rangeDownload.endSegment = Math.max(startSegment, endSegment);
            this.rangeDownload.targetSegment = this.rangeDownload.endSegment - this.rangeDownload.startSegment + 1;
            this.downloadIndex = this.rangeDownload.startSegment - 1;
            this.downloading = true;
          }

          if (this.isGetMP4) {
            let infoIndex = 0;
            m3u8Str.split('\n').forEach(item => {
              if (item.toUpperCase().indexOf('#EXTINF:') > -1) {
                infoIndex++;
                if (this.rangeDownload.startSegment <= infoIndex && infoIndex <= this.rangeDownload.endSegment) {
                  this.durationSecond += parseFloat(item.split('#EXTINF:')[1]);
                }
              }
            });
          }

          if (m3u8Str.indexOf('#EXT-X-KEY') > -1) {
            this.aesConf.method = (m3u8Str.match(/(.*METHOD=([^,\s]+))/) || ['', '', ''])[2];
            this.aesConf.uri = (m3u8Str.match(/(.*URI="([^"]+))"/) || ['', '', ''])[2];
            this.aesConf.iv = (m3u8Str.match(/(.*IV=([^,\s]+))/) || ['', '', ''])[2];
            this.aesConf.iv = this.aesConf.iv ? this.aesConf.stringToBuffer(this.aesConf.iv) : '';
            this.aesConf.uri = this.applyURL(this.aesConf.uri, this.url);

            // let params = m3u8Str.match(/#EXT-X-KEY:([^,]*,?METHOD=([^,]+))?([^,]*,?URI="([^,]+)")?([^,]*,?IV=([^,^\n]+))?/)
            // this.aesConf.method = params[2]
            // this.aesConf.uri = this.applyURL(params[4], this.url)
            // this.aesConf.iv = params[6] ? this.aesConf.stringToBuffer(params[6]) : ''
            this.getAES();
          } else if (this.tsUrlList.length > 0) {
            this.downloadTS();
          } else {
            this.alertError('Resource is empty, please check if the URL is valid');
          }
        },
        fail: () => {
          this.alertError('Incorrect URL, please check if the URL is valid');
        }
      });
    },

    getAES () {
      this.ajax({
        type: 'file',
        url: this.aesConf.uri,
        success: (key) => {
          // console.log('getAES', key)
          // this.aesConf.key = this.aesConf.stringToBuffer(key)
          this.aesConf.key = key;
          this.aesConf.decryptor = new AESDecryptor();
          this.aesConf.decryptor.constructor();
          this.aesConf.decryptor.expandKey(this.aesConf.key);
          this.downloadTS();
        },
        fail: () => {
          this.alertError('The video is encrypted. Please try using the Universal Extractor tool in the bottom right corner.');
        }
      });
    },

    aesDecrypt (data, index) {
      let iv = this.aesConf.iv || new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, index]);
      return this.aesConf.decryptor.decrypt(data, 0, iv.buffer || iv, true);
    },

    downloadTS () {
      this.tips = 'Downloading ts video fragments, please wait';
      let download = () => {
        let isPause = this.isPause;
        let index = this.downloadIndex;
        if (index >= this.rangeDownload.endSegment) {
          return;
        }
        this.downloadIndex++;
        if (this.finishList[index] && this.finishList[index].status === '') {
          this.finishList[index].status = 'downloading';
          this.ajax({
            url: this.tsUrlList[index],
            type: 'file',
            success: (file) => {
              this.dealTS(file, index, () => this.downloadIndex < this.rangeDownload.endSegment && !isPause && download());
            },
            fail: () => {
              this.errorNum++;
              this.finishList[index].status = 'error';
              if (this.downloadIndex < this.rangeDownload.endSegment) {
                !isPause && download();
              }
            }
          });
        } else if (this.downloadIndex < this.rangeDownload.endSegment) {
          !isPause && download();
        }
      };

      for (let i = 0; i < Math.min(6, this.rangeDownload.targetSegment - this.finishNum); i++) {
        download();
      }
    },

    dealTS (file, index, callback) {
      const data = this.aesConf.uri ? this.aesDecrypt(file, index) : file;
      this.conversionMp4(data, index, (afterData) => {
        this.mediaFileList[index - this.rangeDownload.startSegment + 1] = afterData;
        this.finishList[index].status = 'finish';
        this.finishNum++;
        if (this.streamWriter) {
          for (let index = this.streamDownloadIndex; index < this.mediaFileList.length; index++) {
            if (this.mediaFileList[index]) {
              this.streamWriter.write(new Uint8Array(this.mediaFileList[index]));
              this.mediaFileList[index] = null;
              this.streamDownloadIndex = index + 1;
            } else {
              break;
            }
          }
          if (this.streamDownloadIndex >= this.rangeDownload.targetSegment) {
            this.streamWriter.close();
          }
        } else if (this.finishNum === this.rangeDownload.targetSegment) {
          let fileName = this.title || this.formatTime(this.beginTime, 'YYYY_MM_DD hh_mm_ss');
          if (document.title !== 'm3u8 downloader') {
            fileName = this.getDocumentTitle();
          }
          this.downloadFile(this.mediaFileList, fileName);
        }
        callback && callback();
      });
    },

    conversionMp4 (data, index, callback) {
      if (this.isGetMP4) {
        let transmuxer = new muxjs.Transmuxer({
          keepOriginalTimestamps: true,
          duration: parseInt(this.durationSecond),
        });
        transmuxer.on('data', segment => {
          if (index === this.rangeDownload.startSegment - 1) {
            let data = new Uint8Array(segment.initSegment.byteLength + segment.data.byteLength);
            data.set(segment.initSegment, 0);
            data.set(segment.data, segment.initSegment.byteLength);
            callback(data.buffer);
          } else {
            callback(segment.data);
          }
        });
        transmuxer.push(new Uint8Array(data));
        transmuxer.flush();
      } else {
        callback(data);
      }
    },

    togglePause () {
      this.isPause = !this.isPause;
      !this.isPause && this.retryAll(true);
    },

    retry (index) {
      if (this.finishList[index].status === 'error') {
        this.finishList[index].status = '';
        this.ajax({
          url: this.tsUrlList[index],
          type: 'file',
          success: (file) => {
            this.errorNum--;
            this.dealTS(file, index);
          },
          fail: () => {
            this.finishList[index].status = 'error';
          }
        });
      }
    },

    retryAll (forceRestart) {

      if (!this.finishList.length || this.isPause) {
        return;
      }

      let firstErrorIndex = this.downloadIndex;
      this.finishList.forEach((item, index) => {
        if (item.status === 'error') {
          item.status = '';
          firstErrorIndex = Math.min(firstErrorIndex, index);
        }
      });
      this.errorNum = 0;
      if (this.downloadIndex >= this.rangeDownload.endSegment || forceRestart) {
        this.downloadIndex = firstErrorIndex;
        this.downloadTS();
      } else {
        this.downloadIndex = firstErrorIndex;
      }
    },

    downloadFile (fileDataList, fileName) {
      this.tips = 'Integrating ts fragments, please check your browser downloads';
      let fileBlob = null;
      let a = document.createElement('a');
      if (this.isGetMP4) {
        fileBlob = new Blob(fileDataList, { type: 'video/mp4' });
        a.download = fileName + '.mp4';
      } else {
        fileBlob = new Blob(fileDataList, { type: 'video/MP2T' });
        a.download = fileName + '.ts';
      }
      a.href = URL.createObjectURL(fileBlob);
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    },

    formatTime (date, formatStr) {
      const formatType = {
        Y: date.getFullYear(),
        M: date.getMonth() + 1,
        D: date.getDate(),
        h: date.getHours(),
        m: date.getMinutes(),
        s: date.getSeconds(),
      };
      return formatStr.replace(
        /Y+|M+|D+|h+|m+|s+/g,
        target => (new Array(target.length).join('0') + formatType[target[0]]).substr(-target.length)
      );
    },

    forceDownload () {
      if (this.mediaFileList.length) {
        let fileName = this.title || this.formatTime(this.beginTime, 'YYYY_MM_DD hh_mm_ss');
        if (document.title !== 'm3u8 downloader') {
          fileName = this.getDocumentTitle();
        }
        this.downloadFile(this.mediaFileList, fileName);
      } else {
        alert('No downloaded fragments currently');
      }
    },

    alertError (tips) {
      alert(tips);
      this.downloading = false;
      this.tips = 'm3u8 video online extraction tool';
    },

  }
});