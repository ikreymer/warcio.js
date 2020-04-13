const LimitReader = require('./readers').LimitReader;


// ===========================================================================
class WARCRecord
{
  constructor({warcHeaders, stream}) {
    this.warcHeaders = warcHeaders;
    this.headersLen = 0;

    this.stream = new LimitReader(stream, this.warcContentLength);

    this.payload = null;
    this.httpHeaders = null;

    this.consumed = false;

    this.fixUp();
  }

  addHttpHeaders(httpHeaders, headersLen) {
    this.httpHeaders = httpHeaders;
    this.headersLen = headersLen;

    this.stream.setLimitSkip(this.warcContentLength - this.headersLen);
  }

  getResponseInfo() {
    const httpHeaders = this.httpHeaders;

    if (!httpHeaders) {
      return null;
    }

    // match parameters for Response(..., initOpts);
    return {
      headers: httpHeaders.headers,
      status: httpHeaders.statusCode,
      statusText: httpHeaders.statusText
    }
  }

  getReadableStream() {
    const stream = this.stream;
    return new ReadableStream({
      pull(controller) {
        return stream.read().then((result) => {
          // all done;
          if (result.done || !result.value) {
            controller.close();
          } else {
            controller.enqueue(result.value);
          }
        });
      }
    });
  }

  fixUp() {
    // Fix wget-style error where WARC-Target-URI is wrapped in <>
    const uri = this.warcHeaders.headers.get("WARC-Target-URI");
    if (uri && uri.startsWith("<") && uri.endsWith(">")) {
      this.warcHeaders.headers.set("WARC-Target-URI", uri.slice(1, -1));
    }
  }

  async readFully() {
    if (this.consumed) {
      return this.payload;
    }

    this.payload = await this.stream.readFully();
    this.consumed = true;
    return this.payload;
  }

  async skipFully() {
    if (this.consumed) {
      return;
    }

    await this.stream.skipFully();
    this.consumed = true;
  }

  warcHeader(name) {
    return this.warcHeaders.headers.get(name);
  }

  get warcType() {
    return this.warcHeaders.headers.get("WARC-Type");
  }

  get warcTargetURI() {
    return this.warcHeaders.headers.get("WARC-Target-URI");
  }

  get warcDate() {
    return this.warcHeaders.headers.get("WARC-Date");
  }

  get warcRefersToTargetURI() {
    return this.warcHeaders.headers.get("WARC-Refers-To-Target-URI");
  }

  get warcRefersToDate() {
    return this.warcHeaders.headers.get("WARC-Refers-To-Date");
  }

  get warcPayloadDigest() {
    return this.warcHeaders.headers.get("WARC-Payload-Digest");
  }

  get warcContentType() {
    return this.warcHeaders.headers.get("Content-Type");
  }

  get warcContentLength() {
    return Number(this.warcHeaders.headers.get("Content-Length"));
  }
}


// ===========================================================================
exports.WARCRecord = WARCRecord;

