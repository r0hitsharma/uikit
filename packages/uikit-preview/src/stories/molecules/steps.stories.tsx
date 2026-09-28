import { Button, Steps, TextInput } from '@r0hitsharma/design-system';
import { useState } from 'react';

import { css } from '../../../styled-system/css';

export default {
  title: 'Molecules/Steps',
};

const frameClassName = css({
  display: 'grid',
  gap: '4',
  p: '6',
  maxWidth: '640px',
  backgroundColor: 'surface.canvas',
  fontFamily: 'sans',
  color: 'text.default',
});

const actionsClassName = css({
  display: 'flex',
  gap: '2',
  justifyContent: 'flex-end',
});

const STEPS = [
  { title: 'Source', body: 'Pick where the data comes from.' },
  { title: 'Schema', body: 'Map the incoming columns to fields.' },
  { title: 'Review', body: 'Check the summary before you connect.' },
];

type StepsFlowProps = Omit<
  React.ComponentProps<typeof Steps.Root>,
  'count' | 'children'
>;

function StepsFlow(props: StepsFlowProps) {
  return (
    <Steps.Root count={STEPS.length} {...props}>
      <Steps.List>
        {STEPS.map((step, index) => (
          <Steps.Item key={step.title} index={index}>
            <Steps.Trigger>
              <Steps.Indicator />
              {step.title}
            </Steps.Trigger>
            <Steps.Separator />
          </Steps.Item>
        ))}
      </Steps.List>
      {STEPS.map((step, index) => (
        <Steps.Content key={step.title} index={index}>
          {step.body}
        </Steps.Content>
      ))}
      <Steps.CompletedContent>All steps complete.</Steps.CompletedContent>
    </Steps.Root>
  );
}

// Ark owns the behavior (step state, keyboard focus, aria-current="step" on the
// current item); the design-system skin styles each part. The navigation
// triggers compose a design-system Button through `asChild`.
export const Default = () => (
  <div className={frameClassName}>
    <Steps.Root count={STEPS.length} defaultStep={1}>
      <Steps.List>
        {STEPS.map((step, index) => (
          <Steps.Item key={step.title} index={index}>
            <Steps.Trigger>
              <Steps.Indicator />
              {step.title}
            </Steps.Trigger>
            <Steps.Separator />
          </Steps.Item>
        ))}
      </Steps.List>
      <Steps.Progress />
      {STEPS.map((step, index) => (
        <Steps.Content key={step.title} index={index}>
          {step.body}
        </Steps.Content>
      ))}
      <Steps.CompletedContent>All steps complete.</Steps.CompletedContent>
      <div className={actionsClassName}>
        <Steps.PrevTrigger asChild>
          <Button tone="subdued">Back</Button>
        </Steps.PrevTrigger>
        <Steps.NextTrigger asChild>
          <Button emphasis="solid" colorPalette="blue">
            Next
          </Button>
        </Steps.NextTrigger>
      </div>
    </Steps.Root>
  </div>
);

export const Vertical = () => (
  <div className={frameClassName}>
    <StepsFlow orientation="vertical" defaultStep={2} />
  </div>
);

export const Completed = () => (
  <div className={frameClassName}>
    <StepsFlow defaultStep={STEPS.length} />
  </div>
);

// `linear` plus `isStepValid`: Next stays inert until the current step's field
// is filled, and `onStepInvalid` reports the blocked attempt.
export const WithValidation = () => {
  const [name, setName] = useState('');
  const [blocked, setBlocked] = useState(false);

  return (
    <div className={frameClassName}>
      <Steps.Root
        count={2}
        linear
        isStepValid={(index) => index !== 0 || name.trim() !== ''}
        onStepInvalid={() => setBlocked(true)}
        onStepChange={() => setBlocked(false)}
      >
        <Steps.List>
          {['Name', 'Confirm'].map((title, index) => (
            <Steps.Item key={title} index={index}>
              <Steps.Trigger>
                <Steps.Indicator />
                {title}
              </Steps.Trigger>
              <Steps.Separator />
            </Steps.Item>
          ))}
        </Steps.List>
        <Steps.Content index={0}>
          <TextInput
            label="Connection name"
            required
            invalid={blocked}
            errorText="Enter a name to continue."
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Steps.Content>
        <Steps.Content index={1}>Connect as {name}.</Steps.Content>
        <Steps.CompletedContent>Connected.</Steps.CompletedContent>
        <div className={actionsClassName}>
          <Steps.PrevTrigger asChild>
            <Button tone="subdued">Back</Button>
          </Steps.PrevTrigger>
          <Steps.NextTrigger asChild>
            <Button emphasis="solid" colorPalette="blue">
              Next
            </Button>
          </Steps.NextTrigger>
        </div>
      </Steps.Root>
    </div>
  );
};
