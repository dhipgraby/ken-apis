import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from 'lib/common/database/prisma.service';
import { SupportRequestDto } from './dto/support-request.dto';
import { deliverMail, mailTransport } from 'lib/mail/transport';

// For now, support goes to this inbox as requested
const supportTo = 'info@bom-systems.co.uk';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

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
      await deliverMail({
        senderName: 'GoZero Support',
        to: mailTransport() === 'local' ? 'support@example.invalid' : supportTo,
        subject,
        html,
        text: [
          `From: ${user.username} (${user.email}; id: ${userId})`,
          `Type: ${payload.type}`,
          `Subject: ${payload.subject}`,
          `Description: ${payload.description}`,
        ].join('\n'),
        replyTo: user.email,
      });
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
