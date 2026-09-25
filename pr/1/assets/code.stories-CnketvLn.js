import{j as e}from"./index-yF98Ew92.js";import{b as n}from"./css-JXLaXsS0.js";const c=(...t)=>t.filter(Boolean).join(" ");function s({className:t,children:r,...o}){return e.jsx("code",{...o,className:c("code","code--variant_inline",t),"data-scope":"code","data-part":"inline",children:r})}function l({className:t,children:r,...o}){return e.jsx("pre",{...o,className:c("code","code--variant_block",t),"data-scope":"code","data-part":"block",children:e.jsx("code",{children:r})})}const x={title:"Atoms/Code"},a=n({display:"grid",gap:"6",p:"6",backgroundColor:"surface.canvas",fontFamily:"sans",color:"text.default",maxWidth:"68ch"}),i=n({fontSize:"md",lineHeight:"relaxed",color:"text.default"}),d=n({fontSize:"sm",color:"text.muted"}),u=()=>e.jsx("div",{className:a,children:e.jsxs("p",{className:i,children:["Run ",e.jsx(s,{children:"npm run generate"})," to regenerate the styled-system, then import tokens from ",e.jsx(s,{children:"@r0hitsharma/design-system"}),". The"," ",e.jsx(s,{children:"surface.canvas"})," token backs the page frame."]})}),m=n({fontSize:"sm",lineHeight:"relaxed",color:"text.default"}),f=()=>e.jsxs("div",{className:a,children:[e.jsxs("p",{className:i,children:["In 16px body copy, ",e.jsx(s,{children:"npm run generate"})," tracks the line it sits in."]}),e.jsxs("p",{className:m,children:["In 14px caption copy, ",e.jsx(s,{children:"npm run generate"})," scales down with the surrounding text."]})]}),j=()=>e.jsxs("div",{className:a,children:[e.jsx("p",{className:d,children:"Multi-line block"}),e.jsx(l,{children:`import { Panel, StatTile } from '@r0hitsharma/design-system';

export function Summary() {
  return (
    <Panel title="Overview">
      <StatTile label="AUM" value="$10.68M" />
    </Panel>
  );
}`})]}),g=()=>e.jsxs("div",{className:a,children:[e.jsxs("p",{className:i,children:["Install the package with ",e.jsx(s,{children:"npm i @r0hitsharma/design-system"})," and wire the provider:"]}),e.jsx(l,{children:`import { ThemeProvider } from '@r0hitsharma/design-system';

<ThemeProvider>
  <App />
</ThemeProvider>`})]});typeof window<"u"&&window.document&&window.document.createElement&&document.documentElement.setAttribute("data-storyloaded","");export{j as Block,g as Both,u as Inline,f as InlineInProse,x as default};
