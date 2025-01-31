const asyncHandler = require("express-async-handler");
const bcrypt = require("bcrypt");
const {
  User,
  validateRegisterUser,
  validateLoginUser,
} = require("../models/users.model");
const VerificationToken = require("../models/VerificationToken.model");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");

/**-----------------------------------------------
 * @desc    Register New User
 * @route   /api/auth/register
 * @method  POST
 * @access  public
 ------------------------------------------------*/
module.exports.registerUser = asyncHandler(async (req, res) => {
  const { error } = validateRegisterUser(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  let user = await User.findOne({ email: req.body.email });
  if (user) {
    return res.status(400).json({ message: "user already exist" });
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(req.body.password, salt);

  user = new User({
    username: req.body.username,
    email: req.body.email,
    password: hashedPassword,
  });
  await user.save();

  // Creating new VerificationToken & save it toDB
  const verifictionToken = new VerificationToken({
    userId: user._id,
    token: crypto.randomBytes(32).toString("hex"),
  });
  await verifictionToken.save();

  // Making the link
  const link = `${process.env.CLIENT_DOMAIN}/users/${user._id}/verify/${verifictionToken.token}`;

  // Putting the link into an html template
  const htmlTemplate = `
    <div>
      <p>Click on the link below to verify your email</p>
      <a href="${link}">Verify</a>
    </div>`;

  // Sending email to the user
  await sendEmail(user.email, "Verify Your Email", htmlTemplate);

  // Response to the client
  res.status(201).json({
    message: "We sent to you an email, please verify your email address",
  });
});

/**-----------------------------------------------
 * @desc    Login User
 * @route   /api/auth/login
 * @method  POST
 * @access  public
 ------------------------------------------------*/
module.exports.loginUser = asyncHandler(async (req, res) => {
  const { error } = validateLoginUser(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return res.status(400).json({ message: "invalid email or password" });
  }

  const isPasswordMatch = await bcrypt.compare(
    req.body.password,
    user.password
  );

  if (!isPasswordMatch) {
    return res.status(400).json({ message: "invalid email or password" });
  }

  if (!user.isAccountVerified) {
    let verificationToken = await VerificationToken.findOne({
      userId: user._id,
    });

    if (!verificationToken) {
      verificationToken = new VerificationToken({
        userId: user._id,
        token: crypto.randomBytes(32).toString("hex"),
      });
      await verificationToken.save();
    }

    const link = `${process.env.CLIENT_DOMAIN}/users/${user._id}/verify/${verificationToken.token}`;

    const htmlTemplate = `
    <div>
      <p>Click on the link below to verify your email</p>
      <a href="${link}">Verify</a>
    </div>`;

    await sendEmail(user.email, "Verify Your Email", htmlTemplate);

    return res.status(400).json({
      message: "We sent to you an email, please verify your email address",
    });
  }

  const token = user.generateAuthToken();
  res.status(200).json({
    _id: user._id,
    isAdmin: user.isAdmin,
    profilePhoto: user.profilePhoto,
    token,
    username: user.username,
  });
});

/**-----------------------------------------------
 * @desc    Verify User Account
 * @route   /api/auth/:userId/verify/:token
 * @method  GET
 * @access  public
 ------------------------------------------------*/
 module.exports.verifyUserAccount = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(400).json({ message: "Invalid link" });
    }

    const verificationToken = await VerificationToken.findOne({
      userId: user._id,
      token: req.params.token,
    });

    if (!verificationToken) {
      return res.status(400).json({ message: "Invalid link" });
    }

    user.isAccountVerified = true;
    await user.save();

    await VerificationToken.findByIdAndDelete(verificationToken._id);

    res.status(200).json({ message: "Your account has been verified" });
  } catch (error) {
    console.error('Error verifying user account:', error);
    res.status(500).json({ message: "Server error" });
  }
});
