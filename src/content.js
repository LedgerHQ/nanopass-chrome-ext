// This script is executed for all visited pages.
// It allows UI injection when a password is requested.

var shadow = null;


// Watch from incomming messages sent by background.js when a context menu item
// is clicked. The request parameter corresponds to the context menu item id
// string.
chrome.runtime.onMessage.addListener(function (request){
  switch (request){
    case "autofill":
      populate_html(() => { fill_input("auto") });
      break;
    case "fill-password":
      populate_html(() => { fill_input("password") });
      break;
    case "new":
      populate_html(() => { new_password_dialog_show() });
      break;
  }
});


/**
 * When called for the first time, inserts into the current page DOM elements
 * for the nanopass UI client.
 *
 * Due to CSS loading delay, a callback is used and trigerred when the UI is
 * ready (i.e. when the CSS file has been loaded).
 *
 * @param ready_callback Callback called when the UI elements are ready.
 */
function populate_html(ready_callback){
  if (shadow != null) {
    // Already loaded and ready
    ready_callback();
    return;
  }
  // UI is added in a shadow DOM to isolate it from the rest of the page.
  // Isolation avoid CSS interferences, and also prevents DOM access to the UI
  // from the page.
  $(document.body).append('<div class="nanopass-shadow">');
  shadow = $('div.nanopass-shadow')[0].attachShadow({mode: 'closed'});
  // Now load a stylesheet in the shadow DOM tree for the UI
  let link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.extension.getURL('css/nanopass.css');
  link.onload = ready_callback;
  shadow.append(link);
  // And finally append the UI elements
  $(shadow).append(
    '<div class="nanopass nanopass-confirm">' +
    '  <div style="height: 75px; transform: scale(2.5) translate(-25px,0px)" id="anim-confirm"></div>' +
    '  <div style="height: 75px" id="anim-success"></div>' +
    '  <div style="height: 75px" id="anim-fail"></div>' +
    '  <p id="nanopass-confirm-text"></p>' +
    '</div>' +
    '<div class="nanopass nanopass-alert">' +
    '  <div style="height: 50px" id="anim-alert"></div>' +
    '  <p id="nanopass-alert-text"></p>' +
    '</div>' +
    '<div style="display: none" class="nanopass nanopass-new">' +
    '  <table class="nanopass-form">' +
    '    <tr>' +
    '      <td>Name:</td>' +
    '      <td><input id="nanopass-new-name" type="text"/></td>' +
    '    </tr>' +
    '    <tr>' +
    '      <td>Login:</td>' +
    '      <td><input id="nanopass-new-login" type="text"/></td>' +
    '    </tr>' +
    '    <tr>' +
    '      <td>Password:</td>' +
    '      <td>' +
    '        <input id="nanopass-new-password" type="text"/>' +
    '      </td>' +
    '    </tr>' +
    '    <tr>' +
    '      <td></td>' +
    '      <td>' +
    '        <span class="nanopass-discret">Leave blank to generate randomly</span>' +
    '      </td>' +
    '    </tr>' +
    '    <tr>' +
    '      <td></td>' +
    '      <td>' +
    '        <br>' +
    '        <button id="nanopass-new-cancel" style="margin-right: 10px">Cancel</button>' +
    '        <button id="nanopass-new-submit">Set credentials</button>' +
    '      </td>' +
    '    </tr>' +
    '  </table>' +
    '</div>');

  $(shadow).find('button#nanopass-new-cancel').click(new_password_dialog_hide);
  $(shadow).find('button#nanopass-new-submit').click(new_password_dialog_submit);
  ui_init(shadow);
}


function get_previous_input(element){
  all_inputs = $("input");
  return all_inputs[all_inputs.index(element)-1];
}


/**
 * @param mode "auto" to fill login, password and validate the form. "password"
 *     to only fill with the password, without validating the form.
 */
async function fill_input(mode){
  let wallet = await get_wallet();
  if (wallet == null){
    return;
  }
  let element = document.activeElement;
  let name = window.location.hostname;
  let res = wallet.has_name(name);
  has_name = await res;
  if (!has_name){
    alert_dialog_show("Credentials for <i>" + name + "</i> not found");
    return;
  }
  confirm_dialog_show("Confirm password access on device...");
  res = wallet.get_by_name(name);
  entry = await res;
  if (entry != null){
    confirm_dialog_ok("Access to password granted!");
    element.value = entry.password;
    if ((mode == "auto") && (entry.login.length > 0)){
      // Find previous input box which should be login input
      get_previous_input(element).value = entry.login;
    }
    if (mode == "auto"){
      // Submit
      setTimeout(function () { $(element).parents("form:first").submit() }, 2200);
    }
  } else {
    confirm_dialog_fail("Access to password denied!");
  }
}
