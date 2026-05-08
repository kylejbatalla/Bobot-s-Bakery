/* ============================================================
   Bobot's Bakery — site interactivity
   - Mobile nav toggle
   - Order form quantity / subtotal / total calculator
   - Order submission to Google Apps Script Web App
   - Auto-update copyright year
   - Set min pickup date (tomorrow)
   ============================================================ */

(function () {
  'use strict';

  // Hard coded date to ignore for date selector
  const disabledDates = ['2026-05-09', '2026-05-10', '2026-05-25', '2026-05-26',
    '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31'];

  // --- Mobile nav ---
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // --- Copyright year ---
  document.querySelectorAll('#year').forEach(el => {
    el.textContent = new Date().getFullYear();
  });

  // --- Order form: live subtotal / total calculation ---
  const orderItemsBody = document.getElementById('orderItemsBody');
  const orderTotalEl = document.getElementById('orderTotal');
  const orderForm = document.getElementById('orderForm');

  let currentTotal = 0;

  if (orderItemsBody && orderTotalEl) {
    const formatCurrency = (n) => '$' + n.toFixed(0);

    const MAX_QTY = 5;
    const recalc = () => {
      let total = 0;
      orderItemsBody.querySelectorAll('tr').forEach((row) => {
        const price = parseFloat(row.dataset.price) || 0;
        const qtyInput = row.querySelector('.qty');
        let qty = parseInt(qtyInput.value, 10) || 0;
        // Clamp to [0, MAX_QTY]
        if (qty < 0) { qty = 0; qtyInput.value = 0; }
        if (qty > MAX_QTY) { qty = MAX_QTY; qtyInput.value = MAX_QTY; }
        const subtotal = price * qty;
        const subtotalEl = row.querySelector('.subtotal');
        if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
        total += subtotal;
      });
      currentTotal = total;
      orderTotalEl.textContent = formatCurrency(total);
    };

    orderItemsBody.querySelectorAll('.qty').forEach((input) => {
      input.addEventListener('input', recalc);
      input.addEventListener('change', recalc);
    });

    recalc();
  }

  // --- Pickup date: minimum is tomorrow ---
  const pickupDate = document.getElementById("pickupDate");

  if (pickupDate) {
    const now = new Date();

    // Get current Pacific hour
    const pacificHour = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hour12: false,
    }).format(now);

    const hour = parseInt(pacificHour, 10);

    // Start from today
    const minDate = new Date(now);

    // If after 12 PM Pacific, minimum becomes tomorrow
    if (hour >= 12) {
      minDate.setDate(minDate.getDate() + 2);
    } else {
      minDate.setDate(minDate.getDate() + 1);
    }

    // Format as YYYY-MM-DD in local time
    const year = minDate.getFullYear();
    const month = String(minDate.getMonth() + 1).padStart(2, "0");
    const day = String(minDate.getDate()).padStart(2, "0");

    pickupDate.min = `${year}-${month}-${day}`;

  }

  // --- FAQ scroll-reveal animation ---
  const faqItems = document.querySelectorAll('.faq-item');
  if (faqItems.length) {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target); // only animate in once
          }
        });
      }, {
        threshold: 0.25,             // trigger when 25% of the item is in view
        rootMargin: '0px 0px -8% 0px' // fire slightly before fully on screen
      });
      faqItems.forEach(item => observer.observe(item));
    } else {
      // Fallback for very old browsers
      faqItems.forEach(item => item.classList.add('visible'));
    }
  }

  // --- Payment radio group: clear error state on selection ---
  const paymentRadios = document.querySelectorAll('input[name="payment"]');
  if (paymentRadios.length) {
    const optsEl = document.getElementById('paymentOptions');
    const msgEl = document.getElementById('paymentError');
    paymentRadios.forEach((r) => {
      r.addEventListener('change', () => {
        if (optsEl) optsEl.classList.remove('error', 'shake');
        if (msgEl) msgEl.classList.remove('show');
      });
    });
  }

  // --- Notes textarea: live character counter ---
  const notesField = document.getElementById('notes');
  const notesCounter = document.getElementById('notesCounter');
  if (notesField && notesCounter) {
    const max = notesField.getAttribute('maxlength') || 100;
    const updateCounter = () => {
      const len = notesField.value.length;
      notesCounter.textContent = len + ' / ' + max;
      notesCounter.style.color = (len >= max) ? 'var(--flag-red)' : 'var(--wood)';
    };
    notesField.addEventListener('input', updateCounter);
    updateCounter();
  }

  // --- Order submission ---
  if (orderForm) {
    const endpoint = (window.BOBOTS_ORDER_ENDPOINT || '').trim();
    const banner = document.getElementById('comingSoonBanner');
    const submitNote = document.getElementById('submitNote');
    const statusEl = document.getElementById('orderStatus');
    const submitBtn = document.getElementById('submitBtn');

    // If the endpoint is configured, hide the "coming soon" notice
    if (endpoint && banner) banner.style.display = 'none';
    if (endpoint && submitNote) submitNote.style.display = 'none';

    const showStatus = (kind, html) => {
      if (!statusEl) return;
      const styles = {
        success: 'background:#e6f4ea; border:2px solid #2e7d32; color:#1b4d1f;',
        error: 'background:#fde2e2; border:2px solid #ce1126; color:#5c3a1e;',
        info: 'background:#fff3cd; border:2px solid #fcd116; color:#5c3a1e;'
      };
      statusEl.style.cssText =
        'display:block; padding:1rem 1.2rem; border-radius:8px; margin-bottom:1rem; ' +
        (styles[kind] || styles.info);
      statusEl.innerHTML = html;
      statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    orderForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Collect items {key: qty} for any non-zero rows
      const items = {};
      let itemCount = 0;
      orderItemsBody.querySelectorAll('tr').forEach((row) => {
        const key = row.dataset.key;
        const qty = parseInt(row.querySelector('.qty').value, 10) || 0;
        if (key && qty > 0) {
          items[key] = qty;
          itemCount += qty;
        }
      });

      if (itemCount === 0) {
        showStatus('error', '<strong>Hold on —</strong> please choose a quantity for at least one item.');
        return;
      }

      // Payment method (radio group) — visual error state if missing
      const paymentEl = orderForm.querySelector('input[name="payment"]:checked');
      const paymentOptionsEl = document.getElementById('paymentOptions');
      const paymentErrorEl = document.getElementById('paymentError');
      if (!paymentEl) {
        if (paymentOptionsEl) {
          paymentOptionsEl.classList.add('error');
          // Re-trigger the shake every time the user re-submits without a pick
          paymentOptionsEl.classList.remove('shake');
          void paymentOptionsEl.offsetWidth; // force reflow so animation replays
          paymentOptionsEl.classList.add('shake');
        }
        if (paymentErrorEl) paymentErrorEl.classList.add('show');
        if (paymentOptionsEl) paymentOptionsEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const payload = {
        name: document.getElementById('name').value.trim(),
        phone: document.getElementById('phone').value.trim().replace(/\D/g, ""),
        email: document.getElementById('email').value.trim(),
        pickupDate: document.getElementById('pickupDate').value,
        payment: paymentEl.value,
        notes: document.getElementById('notes').value.trim(),
        items: items,
        total: currentTotal
      };

      console.log(pickupDate.value);

      // iOS Safari ignores the `min` attribute on <input type="date"> in its
      // picker UI, so re-check it here as a safety net.
      if (pickupDate.min && pickupDate.value < pickupDate.min) {
        showStatus(
          'error',
          "<strong>Pickup date too soon.</strong> We need at least one day's " +
          "notice. Please choose " + pickupDate.min + " or later."
        );
        return;
      }

      if (disabledDates.includes(pickupDate.value)) {
        showStatus(
          'error',
          "<strong>Pickup date not available.</strong> We're sorry. " + pickupDate.value +
          "<br>is not available. Please choose another pickup date, or " +
          '<a href="contact.html" style="color:var(--flag-red); font-weight:600;">message us directly</a>. '
        );
        return;
      }


      // Submit to Google Apps Script
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending order…';
      try {
        // text/plain avoids a CORS preflight; Apps Script reads e.postData.contents
        const res = await fetch(endpoint, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));

        // Diagnostic: log full response so you can see emailStatus / emailError
        console.log('[Bobot order response]', data);

        if (data && data.ok) {
          // If the email failed silently on the server, surface it so you can see why
          if (data.emailStatus === 'failed') {
            console.warn('[Bobot] Receipt email FAILED on server:', data.emailError);
          } else if (data.emailStatus === 'sent') {
            console.log('[Bobot] Receipt email sent. Remaining Gmail quota:', data.dailyMailQuota);
          }
          showStatus(
            'success',
            "<strong>Salamat, " + escapeHtml(payload.name) + "!</strong> Your order request was received. " +
            "We'll confirm order and payment by phone or email shortly. Check your email inbox for a receipt and pickup address."
          );
          orderForm.reset();
          // Reset subtotals
          orderItemsBody.querySelectorAll('.qty').forEach(i => { i.value = 0; });
          orderItemsBody.querySelectorAll('.subtotal').forEach(s => { s.textContent = '$0'; });
          orderTotalEl.textContent = '$0';
        } else {
          throw new Error(data && data.error ? data.error : 'Unknown error');
        }
      } catch (err) {
        showStatus(
          'error',
          "<strong>Hmm, that didn't go through.</strong> Please try again, or " +
          '<a href="contact.html" style="color:var(--flag-red); font-weight:600;">message us directly</a>. ' +
          '<br><span style="font-size:0.85rem; opacity:0.7;">(Details: ' + escapeHtml(String(err.message || err)) + ')</span>'
        );
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Order Request';
      }
    });
  }

  // --- Google Forms link on contact page ---
  const gfLink = document.getElementById('googleFormsLink');
  if (gfLink) {
    if (window.BOBOTS_GOOGLE_FORM) {
      gfLink.href = window.BOBOTS_GOOGLE_FORM;
      gfLink.target = '_blank';
      gfLink.rel = 'noopener';
    } else {
      gfLink.addEventListener('click', (e) => {
        e.preventDefault();
        alert("Google Forms link isn't set up yet. Please message us on Facebook or call to place your order!");
      });
    }
  }

  // --- helper ---
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
})();
