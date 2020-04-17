import { BaseAsyncIterReader, AsyncIterReader, LimitReader } from './readers';


const decoder = new TextDecoder('utf-8');


// ===========================================================================
class WARCRecord extends BaseAsyncIterReader
{
  constructor({warcHeaders, reader}) {
    super();

    this.warcHeaders = warcHeaders;
    this.headersLen = 0;

    this._reader = new LimitReader(reader, this.warcContentLength);
    this._contentReader = null;

    this.payload = null;
    this.httpHeaders = null;

    this.consumed = false;

    this.fixUp();
  }

  _addHttpHeaders(httpHeaders, headersLen) {
    this.httpHeaders = httpHeaders;
    this.headersLen = headersLen;

    this._reader.setLimitSkip(this.warcContentLength - this.headersLen);
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

  fixUp() {
    // Fix wget-style error where WARC-Target-URI is wrapped in <>
    const uri = this.warcHeaders.headers.get("WARC-Target-URI");
    if (uri && uri.startsWith("<") && uri.endsWith(">")) {
      this.warcHeaders.headers.set("WARC-Target-URI", uri.slice(1, -1));
    }
  }

  async readFully(isContent = false) {
    if (this.httpHeaders) {
      if (this._contentReader && !isContent) {
        throw new TypeError("WARC Record decoding already started, but requesting raw payload");
      }

      if (isContent && this.consumed === "raw" && this.payload) {
        return await this._createDecodingReader([this.payload]).readFully();
      }
    }

    if (this.payload) {
      return this.payload;
    }

    if (isContent) {
      this.payload = await super.readFully();
      this.consumed = "content";
    } else {
      this.payload = await this._reader.readFully();
      this.consumed = "raw";
    }

    return this.payload;
  }

  get reader() {
    if (this._contentReader) {
      throw new TypeError("WARC Record decoding already started, but requesting raw payload");
    }

    return this._reader;
  }

  get contentReader() {
    if (!this.httpHeaders) {
      return this._reader;
    }

    if (!this._contentReader) {
      this._contentReader = this._createDecodingReader(this._reader);
    }

    return this._contentReader;
  }

  _createDecodingReader(source) {
    let contentEnc = this.httpHeaders.headers.get("content-encoding");
    let transferEnc = this.httpHeaders.headers.get("transfer-encoding");

    const chunked = (transferEnc === "chunked");

    // Transfer-Encoding is not chunked and no Content-Encoding
    // try Transfer-Encoding as Content-Encoding
    if (!contentEnc && !chunked) {
      contentEnc = transferEnc;
    }

    return new AsyncIterReader(source, contentEnc, chunked);
  }

  async readlineRaw(maxLength = 0) {
    return this.contentReader.readlineRaw(maxLength);
  }

  async contentText() {
    const payload = await this.readFully(true);
    return decoder.decode(payload);
  }

  async* [Symbol.asyncIterator]() {
    yield* this.contentReader;
  }

  async skipFully() {
    if (this.consumed) {
      return;
    }

    const res = await this._reader.skipFully();
    this.consumed = "skipped";
    return res;
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
export { WARCRecord };

