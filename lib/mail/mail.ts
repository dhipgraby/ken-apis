import { Resend } from "resend";
import * as dotenv from 'dotenv';
import { HttpException, HttpStatus } from "@nestjs/common";
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const domain = process.env.PROD === "true" ? process.env.WEBSITE : `http://localhost:3030`;
const emailFrom = process.env.PROD === "true" ? process.env.EMAIL_FROM : `onboarding@resend.dev`;

const emailFooter = `<br/>
  <small>
     GoZero</small>`;

const emailLogo = `<img alt="GoZero" src="https://gozerocalculator.net/_next/image?url=%2Flogo.png&w=256&q=75" width="150px" />`;

export const sendVerificationEmail = async (
  email: string,
  token: string,
  action: string
) => {
  try {
    let subject;
    let htmlContent;
    if (action === 'email_verification') {
      const confirmLink = `${domain}/auth/new-verification?token=${token}`;
      subject = "GoZero Calculator - Confirm your email";
      htmlContent = `
        ${emailLogo}
        <br/>
        <p>Click <a href="${confirmLink}">here</a> to confirm your email.</p>
        <br/>
        ${emailFooter}
      `;
    } else if (action === 'reset_password') {
      const confirmLink = `${domain}/auth/new-password?token=${token}`;
      subject = "GoZero Calculator - Confirm password reset Token";
      htmlContent = `
        ${emailLogo}
        <br/>
        <p>Click <a href="${confirmLink}">here</a> to set a new password.</p>
        <br/>
        ${emailFooter}
      `;
    } else if (action === 'set_password') {
      const confirmLink = `${domain}/auth/new-password?token=${token}`;
      subject = "GoZero Calculator - Set your password";
      htmlContent = `
        ${emailLogo}
        <br/>
        <p>Welcome to GoZero. Click <a href="${confirmLink}">here</a> to set your password and activate your account.</p>
        <br/>
        ${emailFooter}
      `;
    } else {
      throw new HttpException("Email action not allowed", HttpStatus.BAD_REQUEST);
    }

    const sending = await resend.emails.send({
      from: `GoZero Calculator <${emailFrom}>`,
      to: email,
      subject: subject,
      html: htmlContent
    });

    console.log('Verification email sent to: ', email);
    if (sending.error !== null) throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST)
  } catch (error) {
    throw new HttpException(`Error sending email to: ${email}`, HttpStatus.BAD_REQUEST)
  }
};
