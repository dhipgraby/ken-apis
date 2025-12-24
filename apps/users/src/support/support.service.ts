import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'lib/common/database/prisma.service';
import { SupportRequestDto } from './dto/support-request.dto';
import { Resend } from 'resend';

// For now, support goes to this inbox as requested
const supportTo = 'info@bom-systems.co.uk';
const emailFrom =
  'GoZero Support ' + process.env.PROD === 'true'
    ? `<${process.env.EMAIL_FROM}>`
    : `<onboarding@resend.dev>`;

@Injectable()
export class SupportService {
  private resend: Resend;

  constructor(private readonly prisma: PrismaService) {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendSupportEmail(userId: number, payload: SupportRequestDto) {
    // Enrich with user email/username for context
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, username: true },
    });
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND);

    const subject = `[Support] ${payload.type.toUpperCase()}: ${
      payload.subject
    }`;
    const html = `
      <div>
        <p><b>From:</b> ${user.username} &lt;${
      user.email
    }&gt; (id: ${userId})</p>
        <p><b>Type:</b> ${payload.type}</p>
        <p><b>Subject:</b> ${payload.subject}</p>
        <p><b>Description:</b></p>
        <pre style="white-space:pre-wrap;font-family:inherit;">${this.escapeHtml(
          payload.description,
        )}</pre>
        <hr/>
        <small>Sent from GoZero Users API</small>
      </div>
    `;

    try {
      const res = await this.resend.emails.send({
        from: emailFrom,
        to: supportTo,
        subject,
        html,
        reply_to: user.email,
      } as any);

      if ((res as any)?.error) {
        throw new Error((res as any).error?.message || 'Email sending error');
      }
      return { status: 202, message: 'Support request sent' };
    } catch (err: any) {
      return { status: 500, message: 'Failed to send support request' };
    }
  }

  private escapeHtml(text: string) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
