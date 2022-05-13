import {Box, Colors, Heading, MenuItem, PageHeader, Spinner, Suggest} from '@dagster-io/ui';
import flatMap from 'lodash/flatMap';
import uniq from 'lodash/uniq';
import uniqBy from 'lodash/uniqBy';
import without from 'lodash/without';
import * as React from 'react';
import {useParams} from 'react-router';
import {useHistory} from 'react-router-dom';
import {GraphQueryItem} from '../app/GraphQueryImpl';
import {
  useQueryRefreshAtInterval,
  FIFTEEN_SECONDS,
  QueryRefreshCountdown,
} from '../app/QueryRefresh';

import {
  AssetGraphExplorerWithData,
  selectionFromExplorerPath,
} from '../asset-graph/AssetGraphExplorer';
import {useAssetGraphData} from '../asset-graph/useAssetGraphData';
import {useLiveDataForAssetKeys} from '../asset-graph/useLiveDataForAssetKeys';
import {displayNameForAssetKey, GraphNode, identifyBundles, LiveData} from '../asset-graph/Utils';
import {
  ExplorerPath,
  instanceAssetsExplorerPathFromString,
  instanceAssetsExplorerPathToURL,
} from '../pipelines/PipelinePathUtils';
import {GraphQueryInput} from '../ui/GraphQueryInput';
import {ReloadAllButton} from '../workspace/ReloadAllButton';
import {AssetGrid, keyForAssetId} from './AssetGrid';
import {AssetsCatalogTable} from './AssetsCatalogTable';

import {AssetViewModeSwitch} from './AssetViewModeSwitch';
import {LaunchAssetExecutionButton} from './LaunchAssetExecutionButton';
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

  const {assetGraphData, ...rest} = useAssetGraphData(
    null,
    explorerPath.opsQuery || (view === 'graph' ? '' : '*'),
  );

  const {allBundleNames, graphQueryItems} = React.useMemo(() => {
    const allBundleNames = rest.allAssetKeys
      ? Object.keys(identifyBundles(rest.allAssetKeys.map((a) => JSON.stringify(a.path))))
      : [];
    const graphQueryItems: GraphQueryItem[] = [
      ...allBundleNames.map((b) => ({
        name: `${displayNameForAssetKey(keyForAssetId(b))}/`,
        inputs: [],
        outputs: [],
      })),
      ...rest.graphQueryItems,
    ];

    return {allBundleNames, graphQueryItems};
  }, [rest.allAssetKeys, rest.graphQueryItems]);

  const {liveResult, liveDataByNode} = useLiveDataForAssetKeys(
    null,
    assetGraphData,
    rest.graphAssetKeys,
  );

  const liveDataRefreshState = useQueryRefreshAtInterval(liveResult, FIFTEEN_SECONDS);

  const selection = selectionFromExplorerPath(explorerPath, assetGraphData);
  const onSelect = (token: string | null, e: React.MouseEvent) => {
    if (!token) {
      onChangeExplorerPath({...explorerPath, opNames: ['']}, 'replace');
      return;
    }

    let nextOpNames = [token];

    if (token && e.metaKey) {
      const existing = explorerPath.opNames[0].split(',');
      nextOpNames = [
        (existing.includes(token) ? without(existing, token) : uniq([...existing, token])).join(
          ',',
        ),
      ];
    }

    onChangeExplorerPath({...explorerPath, opNames: nextOpNames}, 'replace');
  };

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
          iconForItem={(item) => (item.name.endsWith('/') ? 'folder' : 'asset')}
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
        <div style={{flex: 1}} />

        <Box flex={{alignItems: 'center', gap: 12}}>
          <QueryRefreshCountdown
            refreshState={liveDataRefreshState}
            dataDescription="materializations"
          />

          <LaunchAssetExecutionButton
            title={titleForLaunch(selection.selectedGraphNodes, liveDataByNode)}
            preferredJobName={explorerPath.pipelineName}
            assets={selection.launchGraphNodes.map((n) => n.definition)}
            upstreamAssetKeys={uniqBy(
              flatMap(selection.launchGraphNodes.map((n) => n.definition.dependencyKeys)),
              (key) => JSON.stringify(key),
            ).filter(
              (key) =>
                !selection.launchGraphNodes.some(
                  (n) => JSON.stringify(n.assetKey) === JSON.stringify(key),
                ),
            )}
          />
        </Box>
      </Box>
      {!assetGraphData ? (
        <Spinner purpose="page" />
      ) : view === 'graph' ? (
        <AssetGraphExplorerWithData
          options={{preferAssetRendering: true, explodeComposites: true}}
          explorerPath={explorerPath}
          onChangeExplorerPath={onChangeExplorerPath}
          liveDataByNode={liveDataByNode}
          assetGraphData={assetGraphData}
          allAssetKeys={rest.allAssetKeys || []}
          graphQueryItems={rest.graphQueryItems}
          liveDataRefreshState={liveDataRefreshState}
          applyingEmptyDefault={rest.applyingEmptyDefault}
        />
      ) : view === 'grid' ? (
        <AssetGrid
          selected={selection.selectedGraphNodes}
          onSelect={onSelect}
          assetGraphData={assetGraphData}
          liveDataByNode={liveDataByNode}
        />
      ) : (
        <AssetsCatalogTable assetGraphData={assetGraphData} explorerPath={explorerPath} />
      )}
    </Box>
  );
};

const titleForLaunch = (nodes: GraphNode[], liveDataByNode: LiveData) => {
  const isRematerializeForAll = (nodes.length
    ? nodes.map((n) => liveDataByNode[n.id])
    : Object.values(liveDataByNode)
  ).every((e) => !!e?.lastMaterialization);

  return `${isRematerializeForAll ? 'Rematerialize' : 'Materialize'} ${
    nodes.length === 0 ? `All` : nodes.length === 1 ? `Selected` : `Selected (${nodes.length})`
  }`;
};
