# Data Deployment Notice

This GitHub package is the application and modeling blueprint. It is not the
production data store.

For production use:

1. Store raw weekly spend files and FEC exports in SharePoint with restricted
   internal permissions.
2. Run the Python ETL or the browser Admin uploader against those files.
3. Publish the generated bundle/workbook into a private Microsoft 365 location.
4. Connect Power BI / Power Apps to that private location.

The sample bundles in `Claude Political Dashboard Design` are synthetic and are
only present so Copilot App Builder can see the expected data shape.
