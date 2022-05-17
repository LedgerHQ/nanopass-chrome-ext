chrome.contextMenus.removeAll();
chrome.contextMenus.create({
    id: "nanopass",
    title: "NanoPass",
    contexts: ["all"],
});
chrome.contextMenus.create({
    id: "autofill",
    parentId: "nanopass",
    title: "Autofill",
    contexts: ["editable"]
});
chrome.contextMenus.create({
    id: "fill-password",
    parentId: "nanopass",
    title: "Fill with password",
    contexts: ["editable"]
});
chrome.contextMenus.create({
    id: "new",
    parentId: "nanopass",
    title: "New password",
    contexts: ["all"]
});
chrome.contextMenus.create({
    id: "manager",
    parentId: "nanopass",
    title: "Open manager",
    contexts: ["all"]
});

function send_message(info, tab){
  if (info.menuItemId == "manager"){
    chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
  } else {
    chrome.tabs.sendMessage(tab.id, info.menuItemId);
  }
}

chrome.contextMenus.onClicked.addListener(send_message);
