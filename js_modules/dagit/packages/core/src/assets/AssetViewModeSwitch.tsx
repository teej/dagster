import {ButtonGroup, ButtonGroupItem} from '@dagster-io/ui';
import * as React from 'react';

import {useFeatureFlags} from '../app/Flags';

import {AssetViewType} from './useAssetView';

export const AssetViewModeSwitch: React.FC<{
  view: AssetViewType;
  setView: (v: AssetViewType) => void;
}> = ({view, setView}) => {
  const {flagExperimentalAssetDAG} = useFeatureFlags();

  const buttons: ButtonGroupItem<AssetViewType>[] = [
    {id: 'graph', icon: 'gantt_waterfall', tooltip: 'Graph view'},
    {id: 'flat', icon: 'view_list', tooltip: 'List view'},
    {id: 'directory', icon: 'folder', tooltip: 'Folder view'},
  ];
  if (flagExperimentalAssetDAG) {
    buttons.unshift({id: 'grid', icon: 'grid', tooltip: 'Grid view'});
  }

  return <ButtonGroup activeItems={new Set([view])} buttons={buttons} onClick={setView} />;
};
