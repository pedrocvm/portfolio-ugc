import assert from 'node:assert/strict';
import test from 'node:test';

import { instagramEmbedUrl } from './normalize';

test('um Reel ou uma publicação têm embed; um Story ou um perfil só abrem no Instagram', () => {
  assert.equal(instagramEmbedUrl('https://www.instagram.com/reel/Dc1pjdVsjGW/'), 'https://www.instagram.com/reel/Dc1pjdVsjGW/embed/');
  assert.equal(instagramEmbedUrl('https://www.instagram.com/p/Dc1pjdVsjGW'), 'https://www.instagram.com/p/Dc1pjdVsjGW/embed/');
  assert.equal(instagramEmbedUrl('https://instagram.com/reels/Dc1pjdVsjGW/?utm_source=ig'), 'https://www.instagram.com/reel/Dc1pjdVsjGW/embed/');
  assert.equal(instagramEmbedUrl('https://www.instagram.com/stories/carolxqueiroz/3979148068020567523'), null);
  assert.equal(instagramEmbedUrl('https://www.instagram.com/carolxqueiroz'), null);
  assert.equal(instagramEmbedUrl('https://evil.com/reel/Dc1pjdVsjGW/'), null);
  assert.equal(instagramEmbedUrl('não é um endereço'), null);
  assert.equal(instagramEmbedUrl(null), null);
});

test('um Reel que ficou só no separador Reels não tem embed; sem saber, tenta-se', () => {
  const reel = 'https://www.instagram.com/reel/Dc1pjdVsjGW/';
  assert.equal(instagramEmbedUrl(reel, { isSharedToFeed: false }), null);
  assert.equal(instagramEmbedUrl(reel, { isSharedToFeed: true }), 'https://www.instagram.com/reel/Dc1pjdVsjGW/embed/');
  assert.equal(instagramEmbedUrl(reel, { isSharedToFeed: null }), 'https://www.instagram.com/reel/Dc1pjdVsjGW/embed/');
});
