(function () {

  const downloadStrategy = window.isSecureContext || 'MozAppearance' in document.documentElement.style ? 'iframe' : 'navigate'

  let middleTransporter = null

  let useBlobFallback = /constructor/i.test(window.HTMLElement) || !!window.safari || !!window.WebKitPoint
  try {
    new Response(new ReadableStream())
    if (window.isSecureContext && !('serviceWorker' in navigator)) {
      useBlobFallback = true
    }
  } catch (err) {
    useBlobFallback = true
  }

  let isSupportTransformStream = false
  try {
    const { readable } = new TransformStream()
    const messageChannel = new MessageChannel()
    messageChannel.port1.postMessage(readable, [readable])
    messageChannel.port1.close()
    messageChannel.port2.close()
    isSupportTransformStream = true
  } catch (err) {
    console.log(err)
  }

  function makeIframe(src) {
    console.log('makeIframe', src)
    const iframe = document.createElement('iframe')
    iframe.hidden = true
    iframe.src = src
    iframe.loaded = false
    iframe.name = 'iframe'
    iframe.isIframe = true
    iframe.postMessage = (...args) => iframe.contentWindow.postMessage(...args)
    iframe.addEventListener('load', () => {
      iframe.loaded = true
    }, { once: true })
    document.body.appendChild(iframe)
    return iframe
  }

  function makePopup(src) {
    console.log('makePopup', src)
    const delegate = document.createDocumentFragment()
    const popup = {
      frame: window.open(src, 'popupTitle', 'width=200,height=100'),
      loaded: false,
      isIframe: false,
      isPopup: true,
      remove() { popup.frame.close() },
      dispatchEvent(...args) { delegate.dispatchEvent(...args) },
      addEventListener(...args) { delegate.addEventListener(...args) },
      removeEventListener(...args) { delegate.removeEventListener(...args) },
      postMessage(...args) { popup.frame.postMessage(...args) }
    }

    const onReady = evt => {
      if (evt.source === popup.frame) {
        popup.loaded = true
        window.removeEventListener('message', onReady)
        popup.dispatchEvent(new Event('load'))
      }
    }

    window.addEventListener('message', onReady)

    return popup
  }

  function createWriteStream(filename) {
    let bytesWritten = 0
    let downloadUrl = null
    let messageChannel = null
    let transformStream = null

    if (!useBlobFallback) {
      // middleTransporter = middleTransporter || makeIframe(streamSaver.middleTransporterUrl)
      middleTransporter = middleTransporter || window.isSecureContext ? makeIframe(streamSaver.middleTransporterUrl) : makePopup(streamSaver.middleTransporterUrl)

      messageChannel = new MessageChannel()

      filename = encodeURIComponent(filename.replace(/\//g, ':'))
        .replace(/['()]/g, escape)
        .replace(/\*/g, '%2A')

      if (isSupportTransformStream) {
        transformStream = new TransformStream(downloadStrategy === 'iframe' ? undefined : {
          transform(chunk, controller) {
            // 传输的内容，仅支持 Uint8Arrays 格式
            if (!(chunk instanceof Uint8Array)) {
              throw new TypeError('Can only write Uint8Arrays')
            }
            bytesWritten += chunk.length
            controller.enqueue(chunk)

            if (downloadUrl) {
              location.href = downloadUrl
              downloadUrl = null
            }
          },

          flush() {
            if (downloadUrl) {
              location.href = downloadUrl
            }
          }
        })
        messageChannel.port1.postMessage({ readableStream: transformStream.readable }, [transformStream.readable])
      }

      messageChannel.port1.onmessage = evt => {
        if (evt.data.download) {
          if (downloadStrategy === 'navigate') {
            middleTransporter.remove()
            middleTransporter = null
            if (bytesWritten) {
              location.href = evt.data.download
            } else {
              downloadUrl = evt.data.download
            }
          } else {
            if (middleTransporter.isPopup) {
              middleTransporter.remove()
              middleTransporter = null
              // Special case for firefox, they can keep sw alive with fetch
              if (downloadStrategy === 'iframe') {
                makeIframe(streamSaver.middleTransporterUrl)
              }
            }

            makeIframe(evt.data.download)
          }
        } else if (evt.data.abort) {
          chunks = []
          messageChannel.port1.postMessage('abort') //send back so controller is aborted
          messageChannel.port1.onmessage = null
          messageChannel.port1.close()
          messageChannel.port2.close()
          messageChannel = null
        }
      }

      const response = {
        transferringReadable: isSupportTransformStream,
        pathname: Math.random().toString().slice(-6) + '/' + filename,
        headers: {
          'Content-Type': 'application/octet-stream; charset=utf-8',
          'Content-Disposition': "attachment; filename*=UTF-8''" + filename
        }
      }
      if (middleTransporter.loaded) {
        middleTransporter.postMessage(response, '*', [messageChannel.port2])
      } else {
        middleTransporter.addEventListener('load', () => {
          middleTransporter.postMessage(response, '*', [messageChannel.port2])
        }, { once: true })
      }
    }

    let chunks = []

    if (!useBlobFallback && transformStream && transformStream.writable) {
      return transformStream.writable
    }

    return new WritableStream({
      write(chunk) {
        if (!(chunk instanceof Uint8Array)) {
          throw new TypeError('Can only write Uint8Arrays')
        }
        if (useBlobFallback) {
          chunks.push(chunk)
          return
        }
        messageChannel.port1.postMessage(chunk)
        bytesWritten += chunk.length

        if (downloadUrl) {
          location.href = downloadUrl
          downloadUrl = null
        }
      },

      close() {
        if (useBlobFallback) {
          const blob = new Blob(chunks, { type: 'application/octet-stream; charset=utf-8' })
          const link = document.createElement('a')
          link.href = URL.createObjectURL(blob)
          link.download = filename
          link.click()
        } else {
          messageChannel.port1.postMessage('end')
        }
      },

      abort() {
        chunks = []
        messageChannel.port1.postMessage('abort')
        messageChannel.port1.onmessage = null
        messageChannel.port1.close()
        messageChannel.port2.close()
        messageChannel = null
      }
    })
  }

  window.streamSaver = {
    createWriteStream,
    middleTransporterUrl: 'mitm.html',
  }
})()
