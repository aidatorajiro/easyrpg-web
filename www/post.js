let urlParams = new URLSearchParams(location.search);
let gameName = urlParams.has("game") ? urlParams.get("game") : "default";
let dbPrefix = urlParams.has("game") ? urlParams.get("game") + "/" : "";

let debugstat = false;

function getSaveFile(filename) {
  return new Promise((res, rej) => {
    easyrpgPlayer.saveFs.loadLocalEntry(
      "/easyrpg/" + dbPrefix + "Save/" + filename,
      (fs_err, fs_res) => {
        if (fs_err !== null) {
          rej(fs_err);
        } else {
          res(fs_res);
        }
      },
    );
  });
}

async function uploadSoundfontDynamic(my_blob) {
  const result = await my_blob.bytes();
  const content_buf = easyrpgPlayer._malloc(result.length);
  easyrpgPlayer.HEAPU8.set(result, content_buf);
  easyrpgPlayer.api_private.uploadSoundfontStep2(
    "imported.sf2",
    content_buf,
    result.length,
  );
  easyrpgPlayer._free(content_buf);
  easyrpgPlayer.api.refreshScene();
  console.log("updated soundfont", result.length);
}

document
  .getElementById("debugimportone")
  .addEventListener("click", function () {
    const num = document.getElementById("debugnumber_importone").value;
    if (!num.match(/^\d{1,2}$/)) {
      alert("invalid save slot id");
      return;
    }
    easyrpgPlayer.api.uploadSavegame(num);
  });

document.getElementById("debugimport").addEventListener("click", function () {
  let file = document.createElement("input");
  file.type = "file";
  file.style.display = "none";
  file.addEventListener("change", async function (evt) {
    const selected_file = evt.target.files[0];
    let my_zip = JSZip();
    let data = await my_zip.loadAsync(await selected_file.arrayBuffer());
    for (let save of data.file(/^.+Save\d+\.lsd$/)) {
      // macosx fix
      if (save.name.match(/^.+(\/|\\)\._/) || save.name.match(/^\._/)) { continue; }
      server_put_log(save.name)
      let contents = await save.async("uint8array");
      // let timestamp = new Date(save.date);
      // let obj = {mode: 33206, contents, timestamp}
      let slot = parseInt(save.name.match(/^.+Save(\d+)\.lsd$/)[1]);
      let buf = easyrpgPlayer._malloc(contents.length);
      easyrpgPlayer.HEAPU8.set(contents, buf);
      easyrpgPlayer.api_private.uploadSavegameStep2(slot, buf, contents.length);
      easyrpgPlayer._free(buf);
      easyrpgPlayer.api.refreshScene();
    }
  });
  file.click();
});

document
  .getElementById("debugexportone")
  .addEventListener("click", function () {
    const num = document.getElementById("debugnumber_exportone").value;
    if (!num.match(/^\d{1,2}$/)) {
      alert("invalid save slot id");
      return;
    }
    easyrpgPlayer.api.downloadSavegame(num);
  });

document.getElementById("debugexec").addEventListener("click", () => {
  let command = document.getElementById("debugta").value;
  server_put_log(command);
  try {
    let r = JSON.stringify(eval(command));
    alert(r);
    server_put_log(r);
  } catch (e) {
    alert(e);
    server_put_log(e);
  }
});

document.getElementById("debugexport").addEventListener("click", async () => {
  let zip = new JSZip();
  let rootDir = "backup-" + gameName + "-" + Date.now();
  let bak = zip.folder(rootDir);
  for (let i = 0; i < 100; i++) {
    let filename;
    if (i < 10) {
      filename = "Save0" + i + ".lsd";
    } else {
      filename = "Save" + i + ".lsd";
    }

    try {
      let sav = await getSaveFile(filename);
      bak.file(filename, sav.contents, { date: sav.timestamp });
    } catch (e) {}
  }
  let content = await bak.generateAsync({ type: "blob" });

  saveAs(content, rootDir + ".zip");
});

document.getElementById("reloadaudio").addEventListener("click", () => {
  easyrpgPlayer.SDL2.audioContext.resume();
});

document.getElementById("debugbtninner").addEventListener("click", () => {
  if (debugstat) {
    document.getElementById("debugbox-outer").style.display = "none";
    debugbox.style.display = "none";
    canvas.focus();
  } else {
    document.getElementById("debugbox-outer").style.display = "block";
    debugbox.style.display = "block";
  }

  debugstat = !debugstat;
});

async function syncSoundfontList() {
  let result = await (await fetch("/api/list_soundfont")).json();
  let el = document.getElementById("soundfontselection");
  el.innerHTML = "";
  let def = document.createElement("option");
  def.innerText = "default";
  el.appendChild(def);
  for (let i = 0; i < result.result.length; i++) {
    let sfel = document.createElement("option");
    sfel.innerText = result.result[i];
    el.appendChild(sfel);
  }
  if (result.current === null) {
    el.selectedIndex = 0;
  } else {
    el.selectedIndex = result.result.indexOf(result.current) + 1;
  }
}

syncSoundfontList();

document.getElementById("uploadsoundfont").addEventListener("click", (ev) => {
  let file = document.createElement("input");
  file.type = "file";
  file.style.display = "none";
  file.addEventListener("change", async function (evt) {
    const selected_file = evt.target.files[0];
    let formdata = new FormData();
    formdata.append("file", selected_file);
    uploadSoundfontDynamic(selected_file);
    await fetch("/api/put_soundfont", { method: "POST", body: formdata });
    await syncSoundfontList();
    document.getElementById("soundfontselection").value = selected_file.name;
  });
  file.click();
});

document
  .getElementById("soundfontselection")
  .addEventListener("change", async (ev) => {
    let el = document.getElementById("soundfontselection");
    let filename;
    if (el.value === "default") {
      filename = null;
    } else {
      filename = el.value;
    }
    await fetch("/api/set_soundfont", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filename }),
    });
    let sfdata = await fetch("/games/" + gameName + "/easyrpg.soundfont", {
      cache: "reload",
    });
    if (el.value === "default") {
      alert("Dynamic switching does not support deactivating soundfont itself. Please reload the page.")
    } else {
      uploadSoundfontDynamic(await sfdata.blob());
    }
  });
