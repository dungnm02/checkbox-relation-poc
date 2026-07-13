// §2 — compile a BackendConfig into a CompiledConfig once and seed the slice. compileConfig
// throws on any invalid config, so a config error surfaces as a boot error here.

import { useEffect, useMemo } from 'react';
import { compileConfig, type CompiledConfig } from '../core/compileConfig';
import type { BackendConfig } from '../core/types';
import { initializeCheckboxes } from '../store/checkboxSlice';
import { useAppDispatch } from '../store/hooks';

export function useCheckboxConfig(backend: BackendConfig): CompiledConfig {
  const dispatch = useAppDispatch();
  const compiled = useMemo(() => compileConfig(backend), [backend]);

  useEffect(() => {
    dispatch(initializeCheckboxes(compiled.initialState));
    if (compiled.warnings.length) {
      for (const w of compiled.warnings) console.warn(`[checkbox-config] ${w}`);
    }
  }, [dispatch, compiled]);

  return compiled;
}
