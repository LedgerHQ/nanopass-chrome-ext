var anim_confirm = null;
var anim_success = null;
var anim_fail = null;
var anim_alert = null;
var ui_root = null;


/**
 * Load lottie animations
 */
function load_animations(){
  $(ui_root).find('#anim-confirm').hide();
  $(ui_root).find('#anim-success').hide();
  $(ui_root).find('#anim-fail').hide();
  console.log("AAA", ui_root);

  anim_confirm = bodymovin.loadAnimation({
    wrapper: $(ui_root).find("#anim-confirm")[0],
    loop: true,
    autoplay: false,
    path: chrome.runtime.getURL("img/nanos-validate.json")
  });
  anim_confirm.stop();

  anim_success = bodymovin.loadAnimation({
    wrapper: $(ui_root).find("#anim-success")[0],
    loop: false,
    autoplay: false,
    path: chrome.runtime.getURL("img/success.json")
  });
  anim_success.stop();

  anim_fail = bodymovin.loadAnimation({
    wrapper: $(ui_root).find("#anim-fail")[0],
    loop: false,
    autoplay: false,
    path: chrome.runtime.getURL("img/fail.json")
  });
  anim_fail.stop();

  anim_alert = bodymovin.loadAnimation({
    wrapper: $(ui_root).find("#anim-alert")[0],
    loop: false,
    autoplay: false,
    path: chrome.runtime.getURL("img/fail.json")
  });
  anim_alert.stop();
}


function confirm_dialog_show(text){
  $(ui_root).find('#nanopass-confirm-text').html(text);
  $(ui_root).find('div.nanopass-confirm').fadeIn(200);
  $(ui_root).find('#anim-confirm').show();
  $(ui_root).find('#anim-success').hide();
  $(ui_root).find('#anim-fail').hide();
  anim_confirm.play();
}


function confirm_dialog_ok(text){
  $(ui_root).find('#nanopass-confirm-text').html(text);
  $(ui_root).find('#anim-confirm').hide();
  $(ui_root).find('#anim-success').show();
  $(ui_root).find('#anim-fail').hide();
  anim_confirm.stop();
  anim_success.play();
  $(ui_root).find('div.nanopass-confirm').delay(2000).fadeOut(200);
}


function confirm_dialog_progress(text, value){
  $(ui_root).find('div.nanopass-confirm').fadeIn(200);
  $(ui_root).find('#nanopass-confirm-text').html(text);
  $(ui_root).find('#anim-confirm').hide();
  $(ui_root).find('#anim-success').show();
  $(ui_root).find('#anim-fail').hide();
  anim_confirm.stop();
  anim_success.stop();
  anim_success.goToAndStop(23 * value, true);
}


function confirm_dialog_fail(text){
  $(ui_root).find('#nanopass-confirm-text').html(text);
  $(ui_root).find('#anim-confirm').hide();
  $(ui_root).find('#anim-success').hide();
  $(ui_root).find('#anim-fail').show();
  anim_confirm.stop();
  anim_fail.play();
  $(ui_root).find('div.nanopass-confirm').delay(2000).fadeOut(200);
}


function alert_dialog_show(html){
  $(ui_root).find('#nanopass-alert-text').html(html);
  $(ui_root).find('div.nanopass-alert').fadeIn(200);
  anim_alert.play();
  $(ui_root).find('div.nanopass-alert').delay(2000).fadeOut(200);
}

async function add_password_dialog_show(url){
  $(ui_root).find('div.nanopass-new').fadeIn(200);
  $(ui_root).find('input#nanopass-new-name').val(url);
  $(ui_root).find('input#nanopass-new-password').val("");
  $(ui_root).find('input#nanopass-new-login').val("");
}

async function update_password_dialog_show(name){
  $(ui_root).find('div.nanopass-new').fadeIn(200);
  $(ui_root).find('input#nanopass-new-name').val(name);
}

async function view_password_dialog_show(name, login, value){
  $(ui_root).find('div.nanopass-new').fadeIn(200);
  $(ui_root).find('input#nanopass-new-name').val(name);
  $(ui_root).find('input#nanopass-new-login').val(login);
  $(ui_root).find('input#nanopass-new-password').val(value);
  $(ui_root).find('button#nanopass-new-submit').hide();
  $(ui_root).find('span#nanopass-discret').hide();
}

async function new_password_dialog_show(){
  $(ui_root).find('div.nanopass-new').fadeIn(200);
  let name = window.location.hostname;
  $(ui_root).find('input#nanopass-new-name').val(name);
  $(ui_root).find('input#nanopass-new-login').focus();
  $(ui_root).find('input#nanopass-new-name').val("");
  $(ui_root).find('input#nanopass-new-login').val("");
}


function new_password_dialog_hide(){
  $(ui_root).find('div.nanopass-new').fadeOut(200);
}


async function new_password_dialog_submit(){
  new_password_dialog_hide();
  let wallet = await get_wallet();
  let name = $(ui_root).find('input#nanopass-new-name').val();
  let login = $(ui_root).find('input#nanopass-new-login').val();
  let password = $(ui_root).find('input#nanopass-new-password').val();
  confirm_dialog_show("Confirm credentials creation on device...");
  wallet.add(name, login, password).then(
    (result) => {
      if (result)
        confirm_dialog_ok("Credentials added!");
      else
        confirm_dialog_fail("Credentials creation denied!");
    }
  );
}


function ui_init(root_el){
  ui_root = root_el;
  load_animations();
  $(ui_root).find('div.nanopass').hide();
}