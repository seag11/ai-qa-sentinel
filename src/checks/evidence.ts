import type { Evidence } from '../types.js';

export const STUDIES = {
  tambon: {
    citation: 'Tambon et al., Bugs in LLM-Generated Code, 2024',
    url: 'https://arxiv.org/abs/2403.08937',
  },
  spracklen: {
    citation: 'Spracklen et al., Package Hallucinations, USENIX Security 2025',
    url: 'https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen',
  },
  wang: {
    citation: 'Wang et al., Deprecated API Usage in LLM Code Completion, ICSE 2025',
    url: 'https://arxiv.org/abs/2406.09834',
  },
  veracode: {
    citation: 'Veracode, 2025 GenAI Code Security Report',
    url: 'https://www.veracode.com/press-release/ai-generated-code-poses-major-security-risks-in-nearly-half-of-all-development-tasks-veracode-research-reveals/',
  },
  pearce: {
    citation: 'Pearce et al., Asleep at the Keyboard?, IEEE S&P 2022',
    url: 'https://arxiv.org/abs/2108.09293',
  },
} as const satisfies Record<string, Evidence>;
