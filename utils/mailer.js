import nodemailer from 'nodemailer';

const brevoTransporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 2525,
    secure: false,
    auth: {
        user: process.env.EMAIL1_USER,
        pass: process.env.EMAIL1_PASS
    }
});

const smtp2goTransporter = nodemailer.createTransport({
    host: 'mail.smtp2go.com',
    port: 8465,
    secure: true,
    auth: {
        user: process.env.EMAIL2_USER,
        pass: process.env.EMAIL2_PASS
    }
});

brevoTransporter.verify()
    .then(() => console.log("Brevo SMTP Server is connected and ready."))
    .catch(error => console.error("Brevo SMTP Error:", error.message));

smtp2goTransporter.verify()
    .then(() => console.log("SMTP2GO Server is connected and ready."))
    .catch(error => console.error("SMTP2GO Error:", error.message));

const sendMail = async (mailOptions) => {
    try {
        return await brevoTransporter.sendMail(mailOptions);
    } catch (e) {
        return await smtp2goTransporter.sendMail(mailOptions);
    }
};

const generateEmailHtml = (options) => {
    const { 
        type = 'otp', 
        title, 
        subtitle, 
        footerText, 
        otpCode, 
        userDetails, 
        discordLink,
        orderId,
        amount,
        date,
        method,
        premiumKey
    } = options;

    let dynamicContent = '';

    if (type === 'otp') {
        dynamicContent = `
            <div style="background-color: #242424; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
                <span style="font-family: 'SF Mono', 'JetBrains Mono', monospace; font-size: 32px; font-weight: 600; letter-spacing: 12px; color: #ffffff;">${otpCode || '000000'}</span>
            </div>
        `;
    }

    if (type === 'welcome' && userDetails) {
        dynamicContent = `
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #121212; border: 1px solid #2a2a2a; border-radius: 8px; margin: 24px 0;">
                <tr>
                    <td style="padding: 20px;">
                        <div style="margin-bottom: 16px;">
                            <p style="margin: 0; color: #888888; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Username</p>
                            <p style="margin: 4px 0 0 0; color: #ffffff; font-size: 16px; font-weight: 500;">${userDetails.username}</p>
                        </div>
                        <div style="height: 1px; background-color: #2a2a2a; margin-bottom: 16px;"></div>
                        <div style="margin-bottom: 16px;">
                            <p style="margin: 0; color: #888888; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Email</p>
                            <p style="margin: 4px 0 0 0; color: #a1a1aa; font-size: 14px;">${userDetails.email}</p>
                        </div>
                        <div style="height: 1px; background-color: #2a2a2a; margin-bottom: 16px;"></div>
                        <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                                <td width="50%" valign="top">
                                    <p style="margin: 0; color: #888888; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Tier</p>
                                    <p style="margin: 4px 0 0 0; color: #a1a1aa; font-size: 14px;">${userDetails.tier || 'Free'}</p>
                                </td>
                                <td width="50%" valign="top">
                                    <p style="margin: 0; color: #888888; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Status</p>
                                    <p style="margin: 4px 0 0 0; color: #4ade80; font-size: 14px;">${userDetails.status || 'Active'}</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #5865F2; border-radius: 8px; margin-bottom: 24px; text-align: center;">
                <tr>
                    <td style="padding: 24px;">
                        <h3 style="margin: 0 0 8px 0; color: #ffffff; font-size: 18px; font-weight: 600;">Join our community</h3>
                        <p style="margin: 0 0 20px 0; color: #e2e8f0; font-size: 14px; line-height: 1.5;">Get updates, support, and connect with other users.</p>
                        <a href="${discordLink || '#'}" style="background-color: #4752C4; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block;">Join Discord &rarr;</a>
                    </td>
                </tr>
            </table>
        `;
    }

    if (type === 'receipt') {
        dynamicContent = `
            <div style="background-color: #121212; border: 1px solid #2a2a2a; border-radius: 8px; margin: 24px 0; overflow: hidden;">
                <div style="background-color: rgba(20, 184, 166, 0.1); border-bottom: 1px solid rgba(20, 184, 166, 0.2); padding: 20px; text-align: center;">
                    <img src="https://img.icons8.com/ios-filled/50/14b8a6/check-document.png" width="32" height="32" style="margin-bottom: 12px;"/>
                    <h3 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600;">Payment Successful</h3>
                    <p style="margin: 8px 0 0 0; color: #a1a1aa; font-size: 14px;">Order #${orderId || 'N/A'}</p>
                </div>
                
                <div style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                        <tr>
                            <td style="color: #888888; font-size: 12px; text-transform: uppercase; padding-bottom: 8px;">Date</td>
                            <td style="color: #ffffff; font-size: 14px; text-align: right; padding-bottom: 8px;">${date || new Date().toLocaleDateString()}</td>
                        </tr>
                        <tr>
                            <td style="color: #888888; font-size: 12px; text-transform: uppercase; padding-bottom: 8px; border-bottom: 1px solid #2a2a2a;">Payment Method</td>
                            <td style="color: #ffffff; font-size: 14px; text-align: right; padding-bottom: 8px; border-bottom: 1px solid #2a2a2a;">${method || 'Secure Checkout'}</td>
                        </tr>
                        <tr>
                            <td style="color: #ffffff; font-size: 14px; font-weight: bold; padding-top: 12px;">Total Paid</td>
                            <td style="color: #14b8a6; font-size: 16px; text-align: right; font-weight: bold; padding-top: 12px;">${amount || '$10.00'}</td>
                        </tr>
                    </table>

                    <div style="background-color: #0e0e10; border: 1px dashed #14b8a6; border-radius: 6px; padding: 20px; text-align: center; margin-top: 24px;">
                        <p style="margin: 0 0 12px 0; color: #14b8a6; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Your Premium Upgrade Key</p>
                        <span style="font-family: 'SF Mono', 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; color: #ffffff; letter-spacing: 2px;">${premiumKey || 'ERROR-GENERATING-KEY'}</span>
                    </div>
                    
                    <p style="margin: 16px 0 0 0; color: #888888; font-size: 12px; text-align: center; line-height: 1.5;">Copy the key above, log into your dashboard, and navigate to the <strong>Upgrade</strong> tab to instantly unlock your premium features.</p>
                </div>
            </div>
            
            <div style="text-align: center;">
                <a href="https://kymor.dev/upgrade" style="background-color: #14b8a6; color: #000000; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">Redeem Key</a>
            </div>
        `;
    }

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #0e0e10; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0e0e10; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #18181b; border-radius: 12px; overflow: hidden; text-align: left;">
                        
                        <tr>
                            <td style="padding: 24px 32px; background-color: #18181b; border-bottom: 1px solid #2a2a2a;">
                                <h1 style="margin: 0; font-size: 18px; font-weight: 700;">
                                    <span style="color: #ffffff;">Ky</span><span style="color: #14b8a6;">mor</span>
                                </h1>
                            </td>
                        </tr>

                        <tr>
                            <td style="padding: 32px;">
                                <h2 style="margin: 0 0 12px 0; color: #ffffff; font-size: 24px; font-weight: 600;">${title}</h2>
                                <p style="margin: 0; color: #a1a1aa; font-size: 15px; line-height: 1.6;">${subtitle}</p>
                                
                                ${dynamicContent}

                                <p style="margin: 24px 0 0 0; color: #71717a; font-size: 13px; line-height: 1.5;">${footerText}</p>
                            </td>
                        </tr>

                        <tr>
                            <td style="padding: 20px 32px; background-color: #18181b; border-top: 1px solid #2a2a2a;">
                                <p style="margin: 0; color: #52525b; font-size: 12px;">Kymor · noreply@kymor.dev</p>
                            </td>
                        </tr>

                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
};

export { sendMail, generateEmailHtml };