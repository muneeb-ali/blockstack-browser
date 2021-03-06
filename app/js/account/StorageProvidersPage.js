import React, { Component, PropTypes } from 'react'
import { bindActionCreators } from 'redux'
import { connect } from 'react-redux'
import { AccountActions } from '../account/store/account'
import { SettingsActions } from '../account/store/settings'

import { DROPBOX, BLOCKSTACK_INC } from './utils/index'
import { getDropboxAccessTokenFromHash,
  redirectToConnectToDropbox } from './utils/dropbox'

import { connectToGaiaHub } from './utils/blockstack-inc'

import { setCoreStorageConfig } from '../utils/api-utils'
import log4js from 'log4js'

const logger = log4js.getLogger('storage/StorageProvidersPage.js')

const Dropbox = require('dropbox')

function mapStateToProps(state) {
  return {
    api: state.settings.api,
    updateApi: PropTypes.func.isRequired,
    resetApi: PropTypes.func.isRequired,
    localIdentities: state.profiles.identity.localIdentities,
    identityKeypairs: state.account.identityAccount.keypairs,
    connectedStorageAtLeastOnce: state.account.connectedStorageAtLeastOnce,
    storageConnected: state.settings.api.storageConnected
  }
}

function mapDispatchToProps(dispatch) {
  const actions = Object.assign({}, SettingsActions, AccountActions)
  return bindActionCreators(actions, dispatch)
}

class StorageProvidersPage extends Component {
  static propTypes = {
    api: PropTypes.object.isRequired,
    updateApi: PropTypes.func.isRequired,
    localIdentities: PropTypes.array.isRequired,
    identityKeypairs: PropTypes.array.isRequired,
    storageIsConnected: PropTypes.func.isRequired,
    connectedStorageAtLeastOnce: PropTypes.bool.isRequired,
    storageConnected: PropTypes.bool.isRequired,
    router: PropTypes.object.isRequired
  }

  constructor(props) {
    super(props)
    this.state = {
      hide: true
    }
    this.connectDropbox = this.connectDropbox.bind(this)
    this.disconnectDropbox = this.disconnectDropbox.bind(this)
    this.updateApi = this.updateApi.bind(this)
  }

  componentWillMount() {
    const api = this.props.api
    const dropboxAccessToken = getDropboxAccessTokenFromHash(window.location.hash)
    const needToConnectGaiaHub = window.location.hash === '#gaiahub'
    const needToConnectDropbox = dropboxAccessToken != null
    if (needToConnectDropbox) {
      const newApi = Object.assign({}, api, { dropboxAccessToken })
      this.props.updateApi(newApi)
      const identityIndex = 0
      const identity = this.props.localIdentities[identityIndex]
      const identityAddress = identity.ownerAddress
      const profileSigningKeypair = this.props.identityKeypairs[identityIndex]
      const profile = identity.profile

      // This is okay selecting storage right now is only done during on-boarding
      const firstDropboxUpload = true

      setCoreStorageConfig(newApi, identityIndex, identityAddress,
        profile, profileSigningKeypair, firstDropboxUpload)
      .then((indexUrl) => {
        logger.debug(`componentDidMount: indexUrl: ${indexUrl}`)
        // TODO add index URL to token file
        logger.debug('componentDidMount: storage initialized')
        const newApi2 = Object.assign({}, newApi, { storageConnected: true })
        this.props.updateApi(newApi2)
        this.props.storageIsConnected()
        logger.debug('componentDidMount: storage configured')
      })
    }
    if (needToConnectGaiaHub) {
      logger.debug('componentDidMount: trying to connect gaia hub...')
      this.connectSharedService()
    }

    // We can show the page contents since there's not going to be a redirect
    if (!(needToConnectGaiaHub || needToConnectDropbox)) {
      this.setState({ hide: false })
    }
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.storageConnected) {
      if (!this.props.connectedStorageAtLeastOnce &&
        nextProps.connectedStorageAtLeastOnce) {
        this.setState({
          hide: true
        })
        this.props.router.push('/')
      }
    }
  }

  connectDropbox() {
    redirectToConnectToDropbox()
  }

  disconnectDropbox() {
    const api = this.props.api
    const dbx = new Dropbox({ accessToken: api.dropboxAccessToken })
    dbx.authTokenRevoke()
    this.props.updateApi(Object.assign({}, api, { dropboxAccessToken: null }))
  }

  connectSharedService() {
    const storageProvider = this.props.api.gaiaHubUrl
    const signer = this.props.identityKeypairs[0].key
    connectToGaiaHub(storageProvider, signer)
      .then((gaiaHubConfig) => {
        const newApi = Object.assign({}, this.props.api,
                                     { gaiaHubConfig,
                                       hostedDataLocation: BLOCKSTACK_INC })
        this.props.updateApi(newApi)
        const identityIndex = 0
        const identity = this.props.localIdentities[identityIndex]
        const identityAddress = identity.ownerAddress
        const profileSigningKeypair = this.props.identityKeypairs[identityIndex]
        const profile = identity.profile
        setCoreStorageConfig(newApi, identityIndex, identityAddress,
          profile, profileSigningKeypair)
        .then((indexUrl) => {
          logger.debug(`componentDidMount: indexUrl: ${indexUrl}`)
          // TODO add index URL to token file
          logger.debug('componentDidMount: storage initialized')
          const newApi2 = Object.assign({}, newApi, { storageConnected: true })
          this.props.updateApi(newApi2)
          this.props.storageIsConnected()
          logger.debug('connectSharedService: storage configured')
        })
      })
  }

  disconnectSharedService() {
    // noop
  }

  updateApi() {
    const api = this.props.api
    this.props.updateApi(api)
  }

  render() {
    const api = this.props.api
    const hide = this.state.hide
    return (
      <div>
      {hide ?
      null
      :
        <div className="m-b-100">
          <h3 className="container-fluid m-t-10">
            Storage Providers
          </h3>
          <p className="container-fluid">
            Your profile and app data will be securely stored in the storage provider you connect.
          </p>
          <p className="container-fluid">
            <em>Note: our storage migration feature will be included in a future version.</em>
          </p>
          <div className="container-fluid">
            <p>
              {api.hostedDataLocation !== BLOCKSTACK_INC ?
                <button
                  onClick={this.connectSharedService}
                  className="btn btn-primary btn-storage btn-lg btn-block"
                  disabled={this.props.storageIsConnected}
                >
                Connect default storage (free storage hub provided by Blockstack PBC)
                </button>
              :
                <button
                  onClick={this.disconnectSharedService}
                  className="btn btn-primary btn-storage btn-lg btn-block"
                  disabled
                  title="Changing storage service providers will be supported in a future version."
                >
                Disconnect default storage (free storage hub provided by Blockstack PBC)
                </button>
              }
            </p>
            <p>
              {api.hostedDataLocation !== DROPBOX ?
                <button
                  onClick={this.connectDropbox}
                  className="btn btn-primary btn-storage btn-lg btn-block"
                  disabled={this.props.storageIsConnected}
                >
                Connect Dropbox
                </button>
              :
                <button
                  onClick={this.disconnectDropbox}
                  className="btn btn-primary btn-storage btn-lg btn-block"
                  title="Changing storage service providers will be supported in a future version."
                  disabled
                >
                Disconnect Dropbox
                </button>
              }
            </p>
            <p>
              <button
                disabled
                className="btn btn-primary btn-storage btn-lg btn-block"
                title="Coming soon!"
              >
                Connect IPFS
              </button>
            </p>
            <p>
              <button
                disabled
                className="btn btn-primary btn-storage btn-lg btn-block"
                title="Coming soon!"
              >
              Connect self-hosted storage
              </button>
            </p>
            <p>
              <button
                disabled
                className="btn btn-primary btn-storage btn-lg btn-block"
                title="Coming soon!"
              >
                Connect Sia
              </button>
            </p>
            <p>
              <button
                disabled
                className="btn btn-primary btn-storage btn-lg btn-block"
                title="Coming soon!"
              >
                Connect Storj
              </button>
            </p>
            <p>
              <button
                disabled
                className="btn btn-primary btn-storage btn-lg btn-block"
                title="Coming soon!"
              >
                Connect Google Drive
              </button>
            </p>
            <p>
              <button
                disabled
                className="btn btn-primary btn-storage btn-lg btn-block"
                title="Coming soon!"
              >
                Connect Amazon Cloud Drive
              </button>
            </p>
            <p>
              <button
                disabled
                className="btn btn-primary btn-storage btn-lg btn-block"
                title="Coming soon!"
              >
              Connect Microsoft OneDrive
              </button>
            </p>
          </div>
        </div>
      }
      </div>
    )
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(StorageProvidersPage)
