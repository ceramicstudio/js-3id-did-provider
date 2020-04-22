class ThreeIdProvider {
  constructor(connection) {
    this.is3idProvider = true;
    this._connection = connection;
  }

  async enable() {
    await this._connection.open();
  }

  async send(req, origin, callback) {
    if (typeof origin === "function") {
      callback = origin;
      origin = null;
    }
    let result = this._connection.send(req);
    const response = {
      id: req.id,
      "json-rpc": "2.0",
      result,
    };
    if (callback) callback(null, response);
    return response;
  }
}

module.exports = ThreeIdProvider;
