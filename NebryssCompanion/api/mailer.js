const nodemailer = require('nodemailer');

function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE !== undefined ? (process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1') : (port === 465);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
    },
  });
}

async function sendVerificationEmail(toEmail, code, username = 'Adventurer') {
  console.log(`\n======================================================`);
  console.log(`[AUTH CODE] Verification Code for ${toEmail} (${username}):`);
  console.log(`            >>>  ${code}  <<<`);
  console.log(`======================================================\n`);

  const transporter = createTransporter();
  if (!transporter) {
    console.warn(`[Mailer] SMTP credentials (SMTP_USER/SMTP_PASS) not configured in .env. Code logged to terminal.`);
    return { success: true, deliveredVia: 'console_fallback' };
  }

  const fromAddress = process.env.SMTP_FROM || `"Nebryss Companion" <${process.env.SMTP_USER}>`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Nebryss Account Verification</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0f1117;
      color: #e2e8f0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    .container {
      max-width: 540px;
      margin: 30px auto;
      background: #181c27;
      border: 1px solid #2d3748;
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 1px solid #2d3748;
    }
    .title {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 2px;
      color: #7dd3fc;
      margin: 0;
      text-transform: uppercase;
    }
    .subtitle {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 6px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .content {
      padding: 24px 0;
      text-align: center;
    }
    .greeting {
      font-size: 16px;
      color: #cbd5e1;
      margin-bottom: 16px;
    }
    .code-box {
      background: #090d16;
      border: 2px solid #38bdf8;
      border-radius: 8px;
      padding: 16px 24px;
      margin: 24px auto;
      display: inline-block;
      letter-spacing: 8px;
      font-size: 32px;
      font-weight: 800;
      color: #38bdf8;
      text-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
    }
    .info {
      font-size: 14px;
      color: #94a3b8;
      line-height: 1.6;
    }
    .footer {
      border-top: 1px solid #2d3748;
      padding-top: 20px;
      font-size: 12px;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="title">NEBRYSS COMPANION</h1>
      <div class="subtitle">Imperial Authentication Registry</div>
    </div>
    <div class="content">
      <p class="greeting">Greetings, <strong>${username}</strong>.</p>
      <p class="info">Enter the 6-digit access code below to verify your email address and authorize your clearance level.</p>
      <div class="code-box">${code}</div>
      <p class="info">This verification code will expire in <strong>15 minutes</strong>.</p>
    </div>
    <div class="footer">
      If you did not initiate this request, you can safely disregard this transmission.
    </div>
  </div>
</body>
</html>
  `;

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject: `[Nebryss Companion] Your Verification Code: ${code}`,
      text: `Greetings ${username},\n\nYour 6-digit verification code for Nebryss Companion is: ${code}\n\nThis code will expire in 15 minutes.\n`,
      html: htmlContent,
    });
    console.log(`[Mailer] Verification email successfully sent to ${toEmail} (Message ID: ${info.messageId})`);
    return { success: true, deliveredVia: 'smtp', messageId: info.messageId };
  } catch (err) {
    console.error(`[Mailer] Error delivering email to ${toEmail}:`, err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendVerificationEmail,
  createTransporter,
};
