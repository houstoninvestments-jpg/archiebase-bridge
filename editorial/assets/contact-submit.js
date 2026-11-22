/* Sends a contact note from the browser through FormSubmit.
   The address is window.BRICK_CURSOR.formTarget in /site-config.js. */
(function () {
  'use strict';
  var friendly = "Something went wrong sending that. Please try again in a minute.";

  window.sendStudioNote = async function (fields) {
    var config = window.BRICK_CURSOR || {};
    var target = String(config.formTarget || "").trim();
    if (!target) throw new Error(friendly);
    if (String(fields.honey || "").trim()) return { ok: true };

    var name = String(fields.name || "").trim();
    var email = String(fields.email || "").trim();
    var message = String(fields.message || "").trim();
    var payload = {
      name: name,
      email: email,
      message: message,
      _subject: "New Brick & Cursor inquiry from " + name,
      _template: "table",
      _captcha: "false",
      _replyto: email,
      _honey: ""
    };
    if (fields.business) payload.business = String(fields.business).trim();
    if (fields.issue) payload.issue = String(fields.issue).trim();

    var response;
    try {
      response = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(target), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      throw new Error(friendly);
    }
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok || (data.success !== true && data.success !== "true")) {
      throw new Error(friendly);
    }
    return data;
  };
})();
