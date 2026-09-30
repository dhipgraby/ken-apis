import * as request from 'supertest';
import { UsersModule } from '../src/users.module';
import { currentAccountCases, fixture } from '../../../test/e2e.helpers';

describe('Users module (integration)', () => {
  const api = fixture(UsersModule);
  beforeAll(() => api.start());
  afterAll(() => api.close());
  currentAccountCases(api, '/user/me', 0);

  it('serves the public greeting', async () => {
    await request(api.server).get('/user').expect(200).expect('Users Api is status 200!');
  });

  it('rejects an anonymous profile request', async () => {
    await request(api.server).get('/user/me').expect(401);
  });

  it('returns the synthetic member profile without a password', async () => {
    const user = await api.seed();
    const { body } = await request(api.server).get('/user/me')
      .set('Authorization', `Bearer ${api.token(user)}`).expect(200);
    expect(body).toMatchObject({
      id: user.id, username: user.username, email: user.email,
      first_name: null, last_name: null,
    });
    expect(body).not.toHaveProperty('password');
  });
});
