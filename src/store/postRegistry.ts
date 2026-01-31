import { PostConfig } from "../types/post.js";

type TenantPostRegistry = {
  [tenantId: string]: PostConfig[];
};

const postRegistry: TenantPostRegistry = {
  elgaenergy: [
    {
      posteId: "commercial_b2b",
      label: "Commercial B2B",
      createdAt: new Date().toISOString(),
    },
  ],
};

export function getPostsForTenant(tenantId: string): PostConfig[] {
  const posts = postRegistry[tenantId];
  if (!posts) {
    throw new Error(`UNKNOWN_TENANT_POSTS: ${tenantId}`);
  }
  return posts;
}

export function getPostConfig(
  tenantId: string,
  posteId: string
): PostConfig {
  const posts = getPostsForTenant(tenantId);
  const post = posts.find((p) => p.posteId === posteId);
  if (!post) {
    throw new Error(`UNKNOWN_POSTE: ${tenantId} / ${posteId}`);
  }
  return post;
}
