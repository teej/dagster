import {Box, Colors, Heading, MenuItem, PageHeader, Spinner, Suggest} from '@dagster-io/ui';
import * as React from 'react';
import {useParams} from 'react-router';
import {useHistory} from 'react-router-dom';

import {AssetGraphExplorer} from '../asset-graph/AssetGraphExplorer';
import {useAssetGraphData} from '../asset-graph/useAssetGraphData';
import {displayNameForAssetKey, identifyBundles} from '../asset-graph/Utils';
import {
  ExplorerPath,
  instanceAssetsExplorerPathFromString,
  instanceAssetsExplorerPathToURL,
} from '../pipelines/PipelinePathUtils';
import {GraphQueryInput} from '../ui/GraphQueryInput';
import {ReloadAllButton} from '../workspace/ReloadAllButton';
import {AssetGrid} from './AssetGrid';
import {AssetsCatalogTable} from './AssetsCatalogTable';

import {AssetViewModeSwitch} from './AssetViewModeSwitch';
import {AssetViewType, useAssetView} from './useAssetView';

function pathForView(view: AssetViewType) {
  return view === 'graph'
    ? '/instance/asset-graph'
    : view === 'grid'
    ? '/instance/asset-grid'
    : '/instance/assets';
}

function viewForPath(path: string): AssetViewType {
  return path.includes('asset-grid') ? 'grid' : path.includes('asset-graph') ? 'graph' : 'flat';
}

export const InstanceAssetsRoot: React.FC = () => {
  const params = useParams();
  const history = useHistory();

  const [, _setView] = useAssetView();
  const view = viewForPath(history.location.pathname);
  const setView = (view: AssetViewType) => {
    _setView(view);
    history.replace(
      instanceAssetsExplorerPathToURL(explorerPath).replace(
        '/instance/asset-graph',
        pathForView(view),
      ),
    );
  };

  const explorerPath = instanceAssetsExplorerPathFromString(params[0]);
  const onChangeExplorerPath = (path: ExplorerPath, mode: 'push' | 'replace') => {
    history[mode](
      instanceAssetsExplorerPathToURL(path).replace('/instance/asset-graph', pathForView(view)),
    );
  };

  const {graphQueryItems, assetGraphData, allAssetKeys} = useAssetGraphData(
    null,
    explorerPath.opsQuery || (view === 'graph' ? '' : '*'),
  );

  const allBundleNames = React.useMemo(() => {
    return allAssetKeys
      ? Object.keys(identifyBundles(allAssetKeys.map((a) => JSON.stringify(a.path))))
      : [];
  }, [allAssetKeys]);

  return (
    <Box
      flex={{direction: 'column', justifyContent: 'stretch'}}
      style={{height: '100%', position: 'relative'}}
    >
      <PageHeader
        title={<Heading>Assets</Heading>}
        right={<ReloadAllButton label="Reload definitions" />}
      />
      <Box
        background={Colors.White}
        padding={{left: 24, right: 12, vertical: 8}}
        border={{side: 'bottom', width: 1, color: Colors.KeylineGray}}
        flex={{direction: 'row', gap: 12}}
      >
        <AssetViewModeSwitch view={view} setView={setView} />

        <GraphQueryInput
          items={graphQueryItems}
          value={explorerPath.opsQuery}
          placeholder="Type an asset subset…"
          onChange={(opsQuery) => onChangeExplorerPath({...explorerPath, opsQuery}, 'replace')}
          popoverPosition="bottom-left"
        />
        {allBundleNames.length > 0 && (
          <Suggest<string>
            inputProps={{placeholder: 'Jump to group...'}}
            items={allBundleNames}
            itemRenderer={(folder, props) => (
              <MenuItem
                text={displayNameForAssetKey({path: JSON.parse(folder)})}
                active={props.modifiers.active}
                onClick={props.handleClick}
                key={folder}
              />
            )}
            noResults={<MenuItem disabled={true} text="Loading..." />}
            inputValueRenderer={(str) => str}
            selectedItem=""
            onItemSelect={(item) => {
              onChangeExplorerPath(
                {
                  ...explorerPath,
                  opsQuery: `${displayNameForAssetKey({path: JSON.parse(item)})}/`,
                },
                'replace',
              );
            }}
          />
        )}
      </Box>
      {!assetGraphData ? (
        <Spinner purpose="page" />
      ) : view === 'graph' ? (
        <AssetGraphExplorer
          options={{preferAssetRendering: true, explodeComposites: true}}
          explorerPath={explorerPath}
          onChangeExplorerPath={onChangeExplorerPath}
        />
      ) : view === 'grid' ? (
        <AssetGrid assetGraphData={assetGraphData} />
      ) : (
        <AssetsCatalogTable assetGraphData={assetGraphData} explorerPath={explorerPath} />
      )}
    </Box>
  );
};
