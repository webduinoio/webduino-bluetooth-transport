+(function (scope, navigator) {

  'use strict';

  var push = Array.prototype.push,
    bluetooth = navigator.bluetooth;

  if (!bluetooth) {
    return;
  }

  var Transport = scope.Transport,
    TransportEvent = scope.TransportEvent,
    util = scope.util,
    proto;

  function WebBluetoothTransport(options) {
    Transport.call(this, options);

    this._options = options;
    this._device = null;
    this._tx = null;
    this._rx = null;
    this._sendTimer = null;
    this._buf = [];

    this._messageHandler = onMessage.bind(this);
    this._sendOutHandler = sendOut.bind(this);
    this._disconnHandler = onDisconnect.bind(this);
    this._errorHandler = onError.bind(this);

    init(this);
  }

  function init(self) {
    bluetooth.requestDevice(util.extend({
      "acceptAllDevices": true,
      "optionalServices": [WebBluetoothTransport.SERVICE_NAME.toLowerCase()]
    }, self._options)).then(function (device) {
      self._device = device;
      device.addEventListener('gattserverdisconnected', self._disconnHandler);
      return device.gatt.connect();
    }).then(function (server) {
      return server.getPrimaryService(WebBluetoothTransport.SERVICE_NAME.toLowerCase());
    }).then(function (service) {
      return service.getCharacteristics();
    }).then(function (characteristics) {
      self._tx = characteristics[0];
      self._rx = characteristics[1];
      self._rx.oncharacteristicvaluechanged = self._messageHandler;
      self._rx.startNotifications();
      self.emit(TransportEvent.OPEN);
    }).catch(self._errorHandler);
  }

  function onMessage(evt) {
    this.emit(TransportEvent.MESSAGE, new Uint8Array(evt.target.value.buffer));
  }

  function onDisconnect() {
    this._device.removeEventListener('gattserverdisconnected', this._disconnHandler);
    this._device = this._tx = this._rx = null;
    delete this._device;
    delete this._tx;
    delete this._rx;
    this.emit(TransportEvent.CLOSE);
  }

  function onError(error) {
    this.emit(TransportEvent.ERROR, new Error(error.toString()));
  }

  function sendOut() {
    var payload = new Uint8Array(this._buf).buffer;
    if (this.isOpen) {
      this._tx.writeValue(payload).then(function () {
        clearBuf(this);
      }.bind(this));
    }
  }

  function clearBuf(self) {
    self._buf = [];
    clearImmediate(self._sendTimer);
    self._sendTimer = null;
  }

  WebBluetoothTransport.prototype = proto = Object.create(Transport.prototype, {

    constructor: {
      value: WebBluetoothTransport
    },

    isOpen: {
      get: function () {
        return this._device && this._device.gatt.connected;
      }
    }

  });

  proto.send = function (payload) {
    push.apply(this._buf, payload);
    if (!this._sendTimer) {
      this._sendTimer = setImmediate(this._sendOutHandler);
    }
  };

  proto.close = function () {
    if (this.isOpen) {
      this._device.gatt.disconnect();
    }
  };

  proto.flush = function () {
    if (this._buf && this._buf.length) {
      this._sendOutHandler();
    }
  };

  WebBluetoothTransport.SERVICE_NAME = '00001101-B5A3-F393-E0A9-E50E24DCCA9E';

  scope.transport.bluetooth = WebBluetoothTransport;

}(webduino, window.navigator));
