/* Sends a contact note from the browser through FormSubmit.
   The address is window.BRICK_CURSOR.formTarget in /site-config.js. */
(function () {
  'use strict';
  var friendly = "Something went wrong sending that. Please try again in a minute.";

  function setReplyFields(form) {
    for (const group of form.querySelectorAll('[data-reply]')) {
      const active = group.dataset.reply === form.elements.replyMethod.value;
      group.hidden = !active;
      const input = group.querySelector('input');
      input.disabled = !active;
      input.required = active;
    }
  }

  for (const selector of document.querySelectorAll('select[name="replyMethod"]')) {
    const form = selector.form;
    setReplyFields(form);
    selector.addEventListener('change', () => setReplyFields(form));
    form.addEventListener('reset', () => queueMicrotask(() => setReplyFields(form)));
  }

  window.studioReplyDetails = function (form) {
    if (form.elements.replyMethod.value === 'text') {
      const mobile = form.elements.mobile.value.trim();
      if (!/^[+0-9().\s-]+$/.test(mobile) || !/^\d{7,15}$/.test(mobile.replace(/\D/g,''))) {
        form.elements.mobile.focus();
        throw new Error('Please enter a mobile number where Aaron can text you.');
      }
      return {replyMethod:'text', mobile};
    }
    return {replyMethod:'email', email:form.elements.email.value.trim()};
  };

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
      "Reply by": fields.replyMethod === "text" ? "Text" : "Email",
      message: message,
      _subject: "New Brick & Cursor inquiry from " + name,
      _template: "table",
      _captcha: "false",

      _honey: ""
    };
    if (fields.replyMethod === "text") payload["Mobile number"] = fields.mobile;
    else { payload.email = email; payload._replyto = email; }
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
    // FormSubmit returns success as a string ("true" / "false"), not a boolean.
    var succeeded = data.success === true || String(data.success).toLowerCase() === "true";
    if (!response.ok || !succeeded) {
      throw new Error(friendly);
    }
    return data;
  };
})();
