# pylint: disable=redefined-outer-name
# start_marker
from dagster import asset, build_assets_job


@asset
def upstream():
    return [1, 2, 3]


@asset
def downstream(upstream):
    return upstream + [4]


all_assets = build_assets_job([upstream, downstream])
# end_marker
