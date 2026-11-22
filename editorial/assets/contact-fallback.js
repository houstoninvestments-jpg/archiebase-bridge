/* Shared message when /api/contact cannot deliver a note.
   The site does not publish an email address, so there is no mailto target. */
(function () {
  var unavailable = "This note was not sent. TODO: add a public studio email, then this form can open a mail draft. No email is shown on the site, so nothing was delivered.";
  window.studioContactUnavailable = unavailable;
  window.studioContactFailure = function (response, data) {
    var status = response ? response.status : 0;
    if (status === 400 || status === 413 || status === 415) {
      return (data && data.error) || "Please check your information and try again.";
    }
    return unavailable;
  };
})();
