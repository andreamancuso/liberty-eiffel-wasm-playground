export const statusMessages: Record<string, string> = {
  success: "Finished",
  cancelled: "Stopped",
  timed_out: "Time limit reached",
  output_limit_exceeded: "Output limit reached",
  compiler_error: "Check your code",
  invalid_input: "Check your project",
  unsupported_feature: "Unsupported feature",
  program_error: "Your program stopped with an error",
  runtime_error: "Your program stopped unexpectedly",
  initialization_error: "Could not prepare the playground. Please try again.",
};
export const phaseMessages: Record<string, string> = {
  loading_frontend: "Loading compiler…",
  loading_backend: "Loading tools…",
  preparing_backend: "Preparing compiler…",
  loading_program: "Loading program…",
  preparing_program: "Preparing program…",
  execute: "Running…",
};
