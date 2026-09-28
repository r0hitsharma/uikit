import { Checkbox, CheckboxGroup } from '@r0hitsharma/design-system';
import { useState } from 'react';

import { css } from '../../../styled-system/css';

export default {
  title: 'Molecules/Checkbox',
};

const frameClassName = css({
  display: 'grid',
  gap: '6',
  p: '6',
  maxWidth: '480px',
  backgroundColor: 'surface.canvas',
  fontFamily: 'sans',
  color: 'text.default',
});

const captionClassName = css({
  m: '0',
  fontSize: 'sm',
  color: 'text.muted',
});

// Ark owns the behavior (the hidden native input carries focus, keyboard
// toggling and the form value); the design-system skin styles each part.
export const States = () => (
  <div className={frameClassName}>
    <Checkbox>Unchecked</Checkbox>
    <Checkbox defaultChecked>Checked</Checkbox>
    <Checkbox checked="indeterminate">Indeterminate</Checkbox>
    <Checkbox invalid>Invalid</Checkbox>
    <Checkbox disabled>Disabled</Checkbox>
    <Checkbox disabled defaultChecked>
      Disabled and checked
    </Checkbox>
  </div>
);

const ASSETS = ['ETH', 'BTC', 'USDC', 'DAI'];

// A multi-select filter list: the group owns one string[] value, and each
// Checkbox contributes its `value`.
export const Group = () => {
  const [selected, setSelected] = useState(['ETH', 'USDC']);

  return (
    <div className={frameClassName}>
      <CheckboxGroup
        label="Assets"
        value={selected}
        onValueChange={setSelected}
      >
        {ASSETS.map((asset) => (
          <Checkbox key={asset} value={asset}>
            {asset}
          </Checkbox>
        ))}
      </CheckboxGroup>
      <p className={captionClassName}>Selected: {selected.join(', ')}</p>
    </div>
  );
};

export const HorizontalGroup = () => (
  <div className={frameClassName}>
    <CheckboxGroup
      label="Chains"
      orientation="horizontal"
      defaultValue={['mainnet']}
    >
      <Checkbox value="mainnet">Mainnet</Checkbox>
      <Checkbox value="base">Base</Checkbox>
      <Checkbox value="arbitrum">Arbitrum</Checkbox>
    </CheckboxGroup>
  </div>
);

// A parent checkbox whose indeterminate state mirrors a partial selection.
export const SelectAll = () => {
  const [selected, setSelected] = useState(['BTC']);
  const all = selected.length === ASSETS.length;
  const some = selected.length > 0 && !all;

  return (
    <div className={frameClassName}>
      <Checkbox
        checked={some ? 'indeterminate' : all}
        onCheckedChange={() => setSelected(all ? [] : [...ASSETS])}
      >
        All assets
      </Checkbox>
      <CheckboxGroup
        aria-label="Assets"
        value={selected}
        onValueChange={setSelected}
      >
        {ASSETS.map((asset) => (
          <Checkbox key={asset} value={asset}>
            {asset}
          </Checkbox>
        ))}
      </CheckboxGroup>
    </div>
  );
};
