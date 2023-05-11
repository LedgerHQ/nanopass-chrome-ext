/* Script included by the manager.html page */

async function remove(){
  let wallet = await get_wallet();
  if (wallet == null)
    return;
  let name = $(this).val();
  confirm_dialog_show("Confirm password removal on device...");
  wallet.delete_by_name(name).then(
    () => { confirm_dialog_ok("Password removed!"); },
    () => { confirm_dialog_fail("Password removal denied!"); }
  );
}

async function update(){
  let wallet = await get_wallet();
  if (wallet == null)
    return;
  let name = $(this).val();
  populate_html(() => { update_password_dialog_show(name) }, "Update");
}

async function list_passwords(){
  let wallet = await get_wallet();
  if (wallet == null)
    return;
  $('table#passwords tbody').empty();
  let size = await wallet.get_size();
  let names = [];
  for (let i = 0; i < size; i++) {
    confirm_dialog_progress('Listing passwords...', i / size);
    let name = await wallet.get_name(i);
    names.push(name);
  }
  confirm_dialog_ok('Listing passwords...');
  for (const name of names){
    $( "div#passwords" ).append(
      '<div class="elt-password"> <p class="name"> '+ name +
      '</p><div class="button-right">'+
      '<button class="update" value="' + name +'">Update</button>'+
      '<button class="remove" value="' + name +'">Remove</button></div>'+
      '</div>');
  }
  $("button.remove").click(remove);
  $("button.update").click(update);
}

async function export_passwords(){
  let wallet = await get_wallet();
  let version = (await wallet.get_version()).version;
  console.log(version);
  confirm_dialog_show("Confirm password export on device...");
  wallet.export().then(
    async (count) => {
      let data = {
        version: version,
        encrypted: true,
        entries: []
      };
      for (let i = 0; i < count; i++){
        confirm_dialog_progress('Exporting...', i / count);
        let entry = await wallet.export_next();
        entry = Array.from(entry).map(x => x.toString(16).padStart(2, '0')).join('');
        data.entries.push(entry);
      }
      console.log(data);
      confirm_dialog_ok('Password exported!');
    },
    () => {
      confirm_dialog_fail("Passwords export denied!");
    }
  );
}
function add_passwords(){
  populate_html(() => { add_password_dialog_show("") }, "Set");
}


function import_passwords(){
  $('input#import-file').trigger('click');
}

async function import_file_selected(evt){
  let filename = evt.target.files[0];
  let p = new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.onerror = reject;
    reader.readAsText(filename);
  });
  text = await p;
  data = JSON.parse(text);
  let wallet = await get_wallet();
  confirm_dialog_show("Confirm passwords import on device");
  wallet.import(data.entries.length).then(
    async () => {
      for (let i = 0; i < data.entries.length; i++){
        // Show progress
        let progress = i / data.entries.length;
        confirm_dialog_progress("Importing...", progress);
        let entry = data.entries[i];
        // Convert hex to bytes
        entry = new Uint8Array(entry.match(/[0-9a-fA-F]{2}/g).map(s => parseInt(s, 16)));
        await wallet.import_next(entry);
      }
      confirm_dialog_ok();
    },
    async () => {
      confirm_dialog_fail("Import denied!");
    }
  );
}

async function display_transport(){
  let transport = await chrome.storage.local.get({"transport": Transport.USB});
  $('button#transport').text(transport.transport);
}

async function switch_transport(){
  let transport = (await chrome.storage.local.get({"transport": Transport.USB})).transport;
  if (transport === Transport.USB) {
    transport = Transport.BLE;
  } else if (transport === Transport.BLE) {
    transport = Transport.USB;
  }
  chrome.storage.local.set({"transport": transport});
  display_transport();
}

$(document).ready(() => {
  ui_init(document.getElementById('uiroot'));
  display_transport();
  $('button#list').click(list_passwords);
  $('button#export').click(export_passwords);
  $('button#import').click(import_passwords);
  $('button#transport').click(switch_transport);
  $('button#add-password').click(add_passwords);
  $('input#import-file').change(import_file_selected);
});
