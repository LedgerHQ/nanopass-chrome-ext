// chrome://flags/#enable-experimental-web-platform-features

var wallet = null;

const Transport = {
  USB: "USB",
  BLE: "BLE"
}

/**
 * Try to get WebHID NanoS device in NanoPass application
 */
async function get_device_usb(){
  // There can be differen productId for NanoS, so filter only on vendorId
  filters = [{ vendorId: 0x2c97 }];
  // Try to get directly the device. This will work without prompting user
  // permission if it has already been validated before on the current website.
  let devices = await navigator.hid.getDevices({filters: filters});
  if (devices.length == 0){
    // If direct access failed, which happen for new websites, ask user
    // confirmation.
    devices = await navigator.hid.requestDevice({filters: filters});
  }
  return devices[0];
}

/**
 * Try to get WebBLE NanoS device in NanoPass application
 */
async function get_device_ble(){
  filters = [{ namePrefix: "Nano" }];
  let device = await navigator.bluetooth.requestDevice({ filters: filters, optionalServices: ["13d63400-2c97-0004-0000-4c6564676572"] });
  return device;
}

// Trick from https://twitter.com/joseph_silber/status/809176159858655234/photo/1
function defer(){
  let defered = {
    promise: null,
    resolve: null,
    reject: null
  };

  defered.promise = new Promise((resolve, reject) => {
    defered.resolve = resolve;
    defered.reject = reject;
  });

  return defered;
}

class Wallet {
  /**
   * @param transport Transport medium: Transport.USB or Transport.BLE.
   */
  constructor (transport){
    this.transport = transport;
  }

  /**
   * @param s A string to be encoded as bytes.
   * @return A Uint8Array encoding the given string.
   */
  str_to_bytes(s){
    let result = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++){
      result[i] = s.charCodeAt(i);
    }
    return result;
  }

  /**
   * @return A fixed size Uint8Array encoding the given string, padded with
   *     zeros, or null if the string is too long.
   */
  str_to_n_bytes(s, n){
    let result = new Uint8Array(n);
    let encoded = this.str_to_bytes(s);
    if (encoded.length > n)
        return;
    result.set(encoded, s);
    return result;
  }

  n_bytes_to_str(bytes){
    let size = bytes.length;
    while ((size > 0) && (bytes[size-1] == 0)){
      size -= 1;
    }
    let result = "";
    for (let i = 0; i < size; i++){
      result += String.fromCharCode(bytes[i]);
    }
    return result;
  }

  u32_to_bytes(n){
    if ((n < 0) || (n > 0xffffffff))
      return null;
    return new Uint8Array([(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff,
      n & 0xff]);
  }

  /**
   * @return Unsigned 32 bits integer from 4 bytes input byte array
   * @param bytes Input byte array
   */
  bytes_to_u32(bytes){
    return (bytes[0] << 24) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
  }

  /**
   * @return Status word value of received data.
   * @param bytes Received data.
   */
  get_sw(bytes){
    if (bytes.length < 2)
        return null;
    return (bytes[bytes.length-2] << 8) + bytes[bytes.length-1];
  }

  async init(){
    if (this.transport === Transport.USB) {
      this.dev = await get_device_usb();
      await this.dev.open();
      this.dev.oninputreport = e => { this.input_handler(e) };
    } else if (this.transport === Transport.BLE) {
      this.dev = await get_device_ble();
      let gatt_server = await this.dev.gatt.connect();
      let service = await gatt_server.getPrimaryService("13d63400-2c97-0004-0000-4c6564676572");
      let characteristics = await service.getCharacteristics();
      let cwrite = characteristics[1];
      let cread = characteristics[0];
      this.cwrite = cwrite;
      await cread.startNotifications();
      cread.addEventListener("characteristicvaluechanged", e => { this.input_handler(e) });
    }
    this.response_defer = null;
    // Following used to aggregate partial responses to get complete APDU
    // response
    this.apdu_state = {
      expected_length: 0,
      received_length: 0,
      chunks: new Array()
    };
  }

  async send_data(data){
    let data_with_len = new Uint8Array(2 + data.length);
    data_with_len.set([(data.length >> 8) & 0xff, data.length & 0xff], 0);
    data_with_len.set(data, 2);
    let offset = 0;
    let seq_id = 0;
    let header_length = null;
    if (this.transport === Transport.USB) {
      header_length = 5;
    } else if (this.transport === Transport.BLE ) {
      header_length = 3;
    }
    while (offset < data_with_len.length){
      let chunk_size = Math.min(data_with_len.length, 64 - header_length);
      let frame = new Uint8Array(chunk_size + header_length);
      if (this.transport === Transport.USB) {
       frame.set([1, 1, 5, (seq_id >> 8) & 0xff, seq_id & 0xff,
         (chunk_size >> 8) & 0xff, chunk_size & 0xff], 0);
      } else if (this.transport === Transport.BLE) {
        frame.set([0x05, (seq_id >> 8) & 0xff, seq_id & 0xff], 0);
      }
      frame.set(data_with_len.slice(offset, offset + chunk_size), header_length);
      offset += chunk_size;
      if (this.transport === Transport.USB) {
        this.dev.sendReport(0, frame);
      } else if (this.transport === Transport.BLE) {
        await this.cwrite.writeValueWithResponse(frame);
      }
      seq_id++;
    }
  }

  async send_apdu(cla, ins, p1, p2, data){
    let data_len = (data == null)?0:data.length;
    let apdu = new Uint8Array(5 + data_len);
    apdu.set([cla, ins, p1, p2, data_len], 0);
    if (data_len > 0) {
      apdu.set(data, 5);
    }
    this.send_data(apdu);
  }

  /**
   * Called by WebHID when data is received from the device. Handles APDU
   * responses which might be received in multiple chunks. This methods
   * aggregates the chunk and resolve the response promise when the response is
   * complete.
   */
  input_handler(e){
    let input_buffer = null;
    let header_length = null;
    if (this.transport === Transport.USB) {
      input_buffer = e.data.buffer;
      header_length = 5;
    } else if (this.transport === Transport.BLE) {
      input_buffer = e.target.value.buffer
      header_length = 3;
    }
    let frame = new Uint8Array(input_buffer);
    let chunk = null;
    if (this.apdu_state.chunks.length == 0){
      // First chunk of the response APDU.
      let length = (frame[header_length] << 8) + frame[header_length + 1];
      chunk = frame.slice(header_length + 2, frame.length);
      this.apdu_state.expected_length = length;
      this.apdu_state.received_length = 0;
    } else {
      chunk = frame.slice(header_length, frame.length);
    }
    this.apdu_state.chunks.push(chunk);
    this.apdu_state.received_length += chunk.length;
    if (this.apdu_state.received_length >= this.apdu_state.expected_length){
      let result = new Uint8Array(this.apdu_state.expected_length);
      let offset = 0;
      this.apdu_state.chunks.forEach(chunk => {
        let trimed = chunk.slice(0,
          Math.min(chunk.length, result.length - offset));
        result.set(trimed, offset);
        offset += trimed.length;
      });
      this.apdu_state.expected_length = 0;
      this.apdu_state.chunks.length = 0;
      this.response_defer.resolve(result);
    }
  }

  exchange(cla, ins, p1, p2, data){
    let p = defer();
    this.response_defer = p;
    this.send_apdu(cla, ins, p1, p2, data);
    return p.promise;
  }

  /**
   * @returns NanoPass application version information, as an array of strings.
   */
  get_version(){
    return this.exchange(0x80, 0x01, 0, 0, null)
      .then((result) => {
        if (this.get_sw(result) == 0x9000){
          result = result.slice(0, result.length-2); // remove SW
          if (result.length < 2)
            return null;
          if (result[0] != 1)
            return null;
          let offset = 1;
          let items = [];
          while (offset < result.length){
            let len = result[offset++];
            let data = result.slice(offset, offset + len);
            if (data.length != len)
              return null;
            items.push(data);
            offset += len;
          }
          if (items.length < 2)
            return null;
          return {
            name: this.n_bytes_to_str(items[0]),
            version: this.n_bytes_to_str(items[1])
          };
        } else {
          return null;
        }
      });
  }

  /**
   * @returns Promise resolving into the number of passwords stored in the
   *     device.
   */
  get_size(){
    return this.exchange(0x80, 0x02, 0, 0, null).then((result) => {
      if ((this.get_sw(result) == 0x9000) && (result.length == 6)) {
        return (result[0] << 24) + (result[1] << 16) + (result[2] << 8) + result[3];
      } else {
        return null;
      }
    });
  }

  /**
   * @returns Name of the n-th stored password.
   */
  get_name(n){
    let data = Uint8Array.from([(n >> 24) & 0xff, (n >> 16) & 0xff,
      (n >> 8) & 0xff, n & 0xff]);
    return this.exchange(0x80, 0x04, 0, 0, data).then((result) => {
      if ((this.get_sw(result) == 0x9000) && (result.length > 2)) {
        return this.n_bytes_to_str(result.slice(0, result.length - 2));
      } else {
        return null;
      }
    });
  }

  /**
   * Request login and password of the entry with the given name.
   * @param name Password entry name.
   * @return Structure with login and password fields.
   */
  get_by_name(name){
    return this.exchange(0x80, 0x05, 0, 0, this.str_to_n_bytes(name, 32))
      .then((result) => {
        if (this.get_sw(result) == 0x9000){
          return {
            login: this.n_bytes_to_str(result.slice(0, 32)),
            password: this.n_bytes_to_str(result.slice(32, 64))
          };
        } else {
          return null;
        }
      });
  }

  /**
   * Delete a stored password entry.
   *
   * @param name Password entry name.
   * @return Promise resolving in case of success, rejecting with status word in
   *     case of error.
   */
  delete_by_name(name){
    return this.exchange(0x80, 0x06, 0, 0, this.str_to_n_bytes(name, 32)).then(
      (result) => {
        return new Promise((resolve, reject) => {
          let sw = this.get_sw(result);
          if (sw == 0x9000)
            resolve();
          else
            reject(sw);
        });
      });
  }
  
  /**
   * Start export procedure
   *
   * @return Promise resolving with the number of passwords to be exported, or
   *     rejecting with the status word.
   */
  export(n){
    return this.exchange(0x80, 0x07, 0x01, 0x00, null).then(
      (result) => {
        return new Promise((resolve, reject) => {
          let sw = this.get_sw(result);
          if ((sw == 0x9000) && (result.length == 6)){
            let count = this.bytes_to_u32(result.slice(0, 4));
            resolve(count);
          } else {
            reject(sw);
          }
        });
      });
  }

  /**
   * Fetch next password to be exported
   *
   * @returns Promise resolving with the password entry in bytes, or rejecting
   *     with a status word.
   */
  export_next(){
    return this.exchange(0x80, 0x08, 0x00, 0x00, null).then(
      (result) => {
        return new Promise((resolve, reject) => {
          let sw = this.get_sw(result);
          if (sw == 0x9000)
            resolve(result.slice(0, result.length-2));
          else
            reject(sw);
        });
      });
  }

  /**
   * Start import procedure
   *
   * @return Promise resolving in true in case of success, false otherwise.
   */
  import(n){
    return this.exchange(0x80, 0x09, 0x01, 0x00, this.u32_to_bytes(n)).then(
      (result) => {
        return new Promise((resolve, reject) => {
          if (this.get_sw(result) == 0x9000)
            resolve();
          else
            reject();
        });
      });
  }

  /**
   * Import next password during password import procedure
   *
   * @param data Password entry
   * @return Promise resolving in true in case of success, false otherwise.
   */
  import_next(data){
    return this.exchange(0x80, 0x0a, 0x00, 0x00, data)
      .then((result) => {
        return this.get_sw(result) == 0x9000;
      });
  }

  /**
   * Queries if a password with the given name is registered in the device.
   * @param name Password entry name.
   */
  has_name(name){
    return this.exchange(0x80, 0x0e, 0, 0, this.str_to_n_bytes(name, 32))
      .then((result) => {
        return result[0] == 0x01;
      });
  }

  /**
   * Create or update password. Password is generated by the device randomly.
   * @param name Password entry name
   * @param login Password login
   * @param password Password. If length is 0, it is generated by the device.
   * @return true in case of success, false otherwise.
   */
  add(name, login, password){
    let data = null;
    let p1 = null;
    if (password.length > 0){
      data = new Uint8Array(32 + 32 + 32);
      p1 = 0;
    } else {
      data = new Uint8Array(32 + 32);
      p1 = 1;
    }
    data.set(this.str_to_n_bytes(name, 32), 0);
    data.set(this.str_to_n_bytes(login, 32), 32);
    if (password.length > 0)
      data.set(this.str_to_n_bytes(password, 32), 64);
    return this.exchange(0x80, 0x03, p1, 0, data).then(
      (result) => {
        return this.get_sw(result) == 0x9000;
      }
    );
  }
}

/**
 * Return Wallet global instance ready to be used. When called first, connect to
 * the wallet. The wallet instance is stored in the global variable 'wallet'.
 */
async function get_wallet(){
  if (wallet == null) {
    let transport = (await chrome.storage.local.get({"transport": Transport.USB})).transport;
    wallet = new Wallet(transport);
    await wallet.init();
    let version = await wallet.get_version();
    if ((version == null) || (version.name != "nanopass")){
      wallet = null;
      alert_dialog_show("NanoPass application is not open!");
      return null;
    }
  }
  return wallet;
}
