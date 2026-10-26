/** Register one slash command without losing later commands to a name collision. */
export function isDuplicateCommandError(error) {
  return /is already registered|already registered/i.test(String(error?.message ?? error));
}

export function registerCommandWithFallback(commands, spec, fallbacks = [], logger = console) {
  for (const name of [spec.name, ...fallbacks]) {
    try {
      commands.register({ ...spec, name });
      if (name !== spec.name) {
        logger.warn?.(`[dsh-purge] /${spec.name} taken, registered /${name}`);
      }
      return name;
    } catch (error) {
      if (isDuplicateCommandError(error)) continue;
      throw error;
    }
  }
  logger.warn?.(`[dsh-purge] skip /${spec.name}: already registered`);
  return null;
}
