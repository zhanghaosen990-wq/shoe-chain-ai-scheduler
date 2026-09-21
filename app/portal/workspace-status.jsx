import React from 'react';
import {ORDER_STATES} from './brand-workspace-data';

// Both role workspaces share the same status wording and visual treatment.
export function Status({value}) {
  return <span className={`brand-status ${value}`}><i aria-hidden="true"/>{ORDER_STATES.find(state=>state.id===value)?.label||value}</span>;
}
