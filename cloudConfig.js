const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: "djdrjal3x",
    api_key: "685932614286799",
    api_secret: "v_CnJ5a0j1QgHBCDt-aLtUanMr0",
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'wanderlust_DEV',
      allowedFormats: ["png", "jpg", "jpeg"],
    },
});

module.exports={
    cloudinary,
    storage,
};