import * as request from 'supertest';
import { AdminModule } from '../src/admin.module';
import { currentAccountCases, fixture } from '../../../test/e2e.helpers';

describe('Admin module (integration)', () => {
  const api = fixture(AdminModule);
  beforeAll(() => api.start());
  afterAll(() => api.close());

  it.each(['/', '/users/all'])('rejects anonymous GET %s', async (path) => {
    await request(api.server).get(path).expect(401);
  });

  it('rejects non-admin claims on both guarded routes', async () => {
    const user = await api.seed();
    const token = api.token(user);
    for (const path of ['/', '/users/all']) {
      await request(api.server).get(path).set('Authorization', `Bearer ${token}`).expect(403);
    }
    await api.prisma.user.delete({ where: { id: user.id } });
  });

  it('serves the admin greeting and reads the owned database row', async () => {
    const user = await api.seed(3);
    const authorization = `Bearer ${api.token(user)}`;
    await request(api.server).get('/').set('Authorization', authorization)
      .expect(200).expect('Admin Api is status 200!');
    const { body } = await request(api.server).get('/users/all')
      .set('Authorization', authorization).expect(200);
    expect(body.pagination.totalItems).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data.find((row: { id: number }) => row.id === user.id)).toMatchObject({
      id: user.id, role: 3, username: user.username, email: user.email,
    });
    for (const row of body.data) expect(row).not.toHaveProperty('password');
  });

  currentAccountCases(api, '/', 3);

  it('rejects forged admin claims from a current member', async () => {
    const user = await api.seed();
    for (const path of ['/', '/users/all']) {
      await request(api.server).get(path)
        .set('Authorization', `Bearer ${api.token({ ...user, role: 3 })}`).expect(403);
    }
  });

  it.each([0, undefined])('accepts current admins with stale or missing role %s', async role => {
    const user = await api.seed(3);
    await request(api.server).get('/')
      .set('Authorization', `Bearer ${api.token({ ...user, role })}`).expect(200);
  });

  it('rejects the same admin token after demotion', async () => {
    const user = await api.seed(3);
    const authorization = `Bearer ${api.token(user)}`;
    await request(api.server).get('/').set('Authorization', authorization).expect(200);
    await api.prisma.user.update({ where: { id: user.id }, data: { role: 0 } });
    await request(api.server).get('/').set('Authorization', authorization).expect(403);
  });
});
