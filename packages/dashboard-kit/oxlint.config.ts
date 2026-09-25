import reactConfig from '@r0hitsharma/oxlint-config/react';

export default {
  ...reactConfig,
  rules: {
    ...reactConfig.rules,
    // Chart adapters render inline data-visualisation SVGs, which legitimately
    // carry `role="img"` + `aria-label`; they cannot be swapped for an <img>.
    'jsx-a11y/prefer-tag-over-role': 'off',
  },
};
