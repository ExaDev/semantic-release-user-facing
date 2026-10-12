import { z } from 'zod';

/**
 * Glob overrides for deciding which changed paths are user-facing. Globs are picomatch patterns matched against repository-relative paths with `/` separators and dotfiles included. A path matching `include` is user-facing even when it also matches `exclude` or a built-in non-shipping default.
 */
export const userFacingRulesSchema = z.strictObject({
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
});

export type UserFacingRules = z.infer<typeof userFacingRulesSchema>;

/**
 * A plugin entry's options are the wrapped stock plugin's own options, unchanged, plus the one namespaced `userFacing` key. The loose object keeps every other key so it can be handed to the stock plugin as given.
 */
const pluginConfigSchema = z.looseObject({
  userFacing: userFacingRulesSchema.prefault({}),
});

export interface PluginConfig {
  /** The user-facing overrides, defaulted to none. */
  readonly rules: UserFacingRules;
  /** Everything except `userFacing`, to pass to the wrapped stock plugin unchanged. */
  readonly delegated: Readonly<Record<string, unknown>>;
}

/**
 * Splits a plugin entry's options into this plugin's own and the wrapped stock plugin's.
 * @param pluginConfig - The options object semantic-release passes to a lifecycle step.
 * @throws A `ZodError` when `userFacing` is not `{ include?: string[]; exclude?: string[] }`.
 */
export function readPluginConfig(pluginConfig: unknown): PluginConfig {
  const { userFacing, ...delegated } = pluginConfigSchema.parse(pluginConfig);

  return { rules: userFacing, delegated };
}
